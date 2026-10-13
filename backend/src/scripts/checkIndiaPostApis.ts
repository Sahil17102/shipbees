import assert from 'node:assert/strict'
import http, { IncomingMessage, ServerResponse } from 'node:http'
import { AddressInfo } from 'node:net'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('error', reject)
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })

const json = (res: ServerResponse, body: unknown) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const main = async () => {
  const seen: string[] = []
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const bodyBuffer = await readBody(req)
    const bodyText = bodyBuffer.toString('utf8')
    const body = /application\/json/.test(String(req.headers['content-type'])) && bodyText ? JSON.parse(bodyText) : null
    seen.push(`${req.method} ${url.pathname}`)

    if (url.pathname === '/v1/access/login') {
      assert.deepEqual(body, { username: 'uat-user', password: 'uat-pass' })
      return json(res, { success: true, data: { access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600, refresh_expires_in: 7200 } })
    }
    if (url.pathname === '/v1/access/TokenWithRtoken') {
      assert.equal(req.headers.authorization, 'Bearer refresh-token')
      return json(res, { access_token: 'refreshed-access-token', refresh_token: 'refresh-token', expires_in: 3600, refresh_expires_in: 7200 })
    }
    assert.equal(req.headers.authorization, 'Bearer refreshed-access-token')

    if (url.pathname === '/v1/speed-post/tariffs') {
      assert.equal(url.searchParams.get('product-code'), 'SP')
      assert.equal(url.searchParams.get('source-pincode'), '400001')
      return json(res, { success: true, total_with_tax: 61 })
    }
    if (url.pathname === '/v1/business-parcel-tariff/calculate') {
      assert.equal(url.searchParams.get('product-code'), 'BP')
      return json(res, { success: true, final_amount: 152 })
    }
    if (url.pathname === '/v1/offices/limited-details') {
      assert.equal(url.searchParams.get('office-type'), 'post')
      return json(res, [{ pincode: 570001, office_name: 'Mysuru H.O' }])
    }
    if (url.pathname === '/process-articles/9999999999') {
      assert.equal(body.articles[0].barcode_no, 'EB126023474IN')
      return json(res, { success: true, valid_articles: [{ barcode_no: 'EB126023474IN', calculated_tariff: 61 }], error_articles: [] })
    }
    if (url.pathname === '/process-articles-file/9999999999') {
      assert.match(String(req.headers['content-type']), /multipart\/form-data; boundary=/)
      assert.match(bodyText, /"articles"/)
      return json(res, { success: true, valid_articles: [{ barcode_no: 'EB126023474IN' }] })
    }
    if (url.pathname === '/v1/label/create/domestic') {
      assert.equal(body.barcode_no, 'EB126023474IN')
      res.writeHead(200, { 'Content-Type': 'application/pdf' })
      return res.end(Buffer.from('%PDF-1.4 mock'))
    }
    if (url.pathname === '/v1/event/download') {
      assert.deepEqual(body, { Cust_Id: '9999999999', Event_Code: 'LE', Event_Date: '17082026' })
      res.writeHead(200, { 'Content-Type': 'application/xml' })
      return res.end('<LatestEventDetails />')
    }
    if (url.pathname === '/v1/tracking/bulk') {
      assert.deepEqual(body, { bulk: ['EB126023474IN'] })
      return json(res, { status_code: 200, success: true, data: [] })
    }
    res.writeHead(404).end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const file = join(process.cwd(), 'indiapost-contract-test.json')
  await writeFile(file, JSON.stringify({ articles: [{ barcode_no: 'EB126023474IN' }] }))

  try {
    const { IndiaPostService, buildIndiaPostArticleFromShipment } = await import('../models/services/couriers/indiaPost.service')
    const api = new IndiaPostService({ apiBase: base, masterDataBase: base, username: 'uat-user', password: 'uat-pass', customerId: '9999999999', contractId: '41441234' })
    await api.login()
    await api.refreshAccessToken()
    await api.speedPostTariff({ weight: 250, sourcePincode: '400001', destinationPincode: '110001', length: 30, width: 21, height: 0.5, insuranceValue: 1000, pod: true })
    await api.businessParcelTariff({ weight: 550, sourcePincode: '141010', destinationPincode: '110057', length: 10, width: 5, height: 2, insuranceValue: 1000 })
    await api.searchPincode('570001')
    const article = buildIndiaPostArticleFromShipment({ order_number: 'ORDER-1', payment_type: 'prepaid', package_weight: 0.25, package_length: 30, package_breadth: 21, package_height: 1, indiapost_barcode_no: 'EB126023474IN', pickup: { name: 'Shipray', warehouse_name: 'Shipray Hub', address: 'Address One', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', phone: '9999999999' }, consignee: { name: 'Test Buyer', address: 'Address Two', city: 'Delhi', state: 'Delhi', pincode: '110001', phone: '8888888888' } }, api)
    await api.bookArticles([article])
    await api.bookArticlesFile(file)
    const label = await api.generateDomesticLabel({ barcode_no: 'EB126023474IN' })
    assert.match(Buffer.from(label).toString('utf8'), /^%PDF/)
    assert.equal(await api.downloadEvents({ eventCode: 'LE', eventDate: '17082026' }), '<LatestEventDetails />')
    await api.trackBulk(['EB126023474IN'])
    assert.equal(seen.filter((entry) => entry.endsWith('/v1/access/login')).length, 1)
    assert.equal(seen.length, 10)
    console.log('India Post integration contract checks passed')
    console.log(JSON.stringify({ calls: seen }, null, 2))
  } finally {
    await unlink(file).catch(() => undefined)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

main().catch((error) => {
  console.error('India Post integration contract checks failed')
  console.error(error)
  process.exit(1)
})
