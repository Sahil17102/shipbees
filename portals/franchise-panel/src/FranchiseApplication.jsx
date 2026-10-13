import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  LoaderCircle,
  MapPinned,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { portalApi } from './api'

const initialForm = {
  applicantName: '',
  applicantEmail: '',
  applicantPhone: '',
  businessName: '',
  registeredBusinessName: '',
  businessType: '',
  currentCity: '',
  currentState: '',
  expectedMonthlyShipments: '',
  preferredContactMethod: 'phone',
  experience: '',
  message: '',
  productId: '',
  geoUnitId: '',
  consent: false,
  website: '',
}

const savedApplicationKey = 'shipbeesFranchiseApplication'

const getSavedApplication = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(savedApplicationKey) || 'null')
    return saved?.applicationNumber ? saved : null
  } catch {
    return null
  }
}

const saveApplication = (applicationNumber, form) => {
  try {
    localStorage.setItem(
      savedApplicationKey,
      JSON.stringify({
        applicationNumber,
        applicantEmail: form.applicantEmail,
        businessName: form.businessName,
        submittedAt: new Date().toISOString(),
      }),
    )
  } catch {
    // The confirmation remains visible for this session if browser storage is unavailable.
  }
}

const territoryLabel = (territory) =>
  [territory.name, territory.city, territory.district, territory.state, territory.pincode]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ')

export default function FranchiseApplication({ navigate }) {
  const [opportunities, setOpportunities] = useState({ products: [], territories: [] })
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [savedApplication] = useState(getSavedApplication)
  const [applicationNumber, setApplicationNumber] = useState(
    savedApplication?.applicationNumber || '',
  )

  useEffect(() => {
    let active = true
    portalApi
      .opportunities()
      .then((data) => {
        if (active) setOpportunities(data)
      })
      .catch((error) => {
        if (active) {
          setLoadError(
            error.response?.data?.message ||
              'Available franchise plans could not be loaded. Please try again shortly.',
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedProduct = opportunities.products.find((product) => product.id === form.productId)
  const matchingTerritories = useMemo(
    () =>
      opportunities.territories.filter(
        (territory) => !selectedProduct || territory.type === selectedProduct.tier,
      ),
    [opportunities.territories, selectedProduct],
  )
  const applicationsOpen = opportunities.products.length > 0 && opportunities.territories.length > 0

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'productId' ? { geoUnitId: '' } : {}),
    }))
    setSubmitError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await portalApi.submitApplication(form)
      const reference = response.data.applicationNumber
      saveApplication(reference, form)
      setApplicationNumber(reference)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setSubmitError(error.response?.data?.message || 'Application could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  if (applicationNumber) {
    return (
      <main className="apply-page">
        <section className="application-success">
          <img src="/logo/shipbees-logo.svg" alt="ShipBees" />
          <span className="success-icon"><CheckCircle2 size={30} /></span>
          <p className="eyebrow">Application received</p>
          <h1>Your franchise request is in review.</h1>
          <p>
            {savedApplication
              ? 'Your submitted request is saved on this device. The ShipBees franchise team will contact you after reviewing your territory and business details.'
              : 'Keep this reference number safe. The ShipBees franchise team will contact you after reviewing your territory and business details.'}
          </p>
          <strong className="application-number">{applicationNumber}</strong>
          <button className="primary-button" onClick={() => navigate('/login', true)}>
            Return to partner login <ArrowRight size={17} />
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="apply-page">
      <header className="apply-topbar">
        <a href="/login" onClick={(event) => { event.preventDefault(); navigate('/login') }}>
          <img src="/logo/shipbees-logo.svg" alt="ShipBees" />
        </a>
        <button className="secondary-button" onClick={() => navigate('/login')}>
          <ArrowLeft size={16} /> Partner login
        </button>
      </header>

      <section className="apply-intro">
        <div>
          <span className="eyebrow"><MapPinned size={14} /> ShipBees Franchise Network</span>
          <h1>Build a stronger delivery network in your market.</h1>
          <p>
            Tell us about your business and preferred territory. Our team will review availability,
            commercial fit, and the next onboarding steps.
          </p>
        </div>
        <div className="apply-process" aria-label="Franchise application process">
          <span><b>01</b> Apply</span>
          <span><b>02</b> Review</span>
          <span><b>03</b> Verify</span>
          <span><b>04</b> Activate</span>
        </div>
      </section>

      <section className="apply-layout">
        <aside className="apply-aside">
          <span className="aside-icon"><Building2 size={22} /></span>
          <h2>Before you apply</h2>
          <ul>
            <li><CheckCircle2 size={17} /> Choose a published franchise plan.</li>
            <li><CheckCircle2 size={17} /> Select an available territory matching that plan.</li>
            <li><CheckCircle2 size={17} /> Use an email you can access for approval updates.</li>
            <li><CheckCircle2 size={17} /> KYC, payment, and agreement follow after review.</li>
          </ul>
          <div className="apply-security">
            <ShieldCheck size={18} />
            <span><strong>Controlled onboarding</strong>Your request goes directly to the ShipBees admin review queue.</span>
          </div>
        </aside>

        <div className="apply-form-card">
          <div className="form-heading">
            <span>FRANCHISE APPLICATION</span>
            <h2>Start your application</h2>
            <p>Required fields are marked with an asterisk.</p>
          </div>

          {loading && (
            <div className="application-state"><LoaderCircle className="spin" size={22} /> Loading available plans and territories…</div>
          )}

          {!loading && loadError && (
            <div className="form-error"><AlertTriangle size={17} />{loadError}</div>
          )}

          {!loading && !loadError && !applicationsOpen && opportunities.products.length === 0 && (
            <div className="application-unavailable">
              <AlertTriangle size={22} />
              <div>
                <strong>New territory applications are being prepared.</strong>
                <p>
                  The admin team has not published a franchise plan and matching territory yet.
                  Please check back shortly or contact {opportunities.quoteEmail || 'the ShipBees team'}.
                </p>
              </div>
            </div>
          )}

          {!loading && !loadError && !applicationsOpen && opportunities.products.length > 0 && (
            <div className="application-unavailable">
              <CheckCircle2 size={22} />
              <div>
                <strong>Published territory applications are currently under review.</strong>
                <p>
                  If you already submitted an application, it is safely recorded in the ShipBees
                  review queue. Your reference confirmation will remain visible on the device used
                  to submit future applications. New applications will reopen when another
                  territory becomes available.
                </p>
              </div>
            </div>
          )}

          {!loading && !loadError && applicationsOpen && (
            <form className="application-form" onSubmit={submit}>
              <div className="form-section-title"><span>01</span><div><strong>Your details</strong><small>Who should our franchise team contact?</small></div></div>
              <div className="apply-grid">
                <label>Full name *<input value={form.applicantName} onChange={update('applicantName')} maxLength="160" required /></label>
                <label>Work email *<input type="email" value={form.applicantEmail} onChange={update('applicantEmail')} maxLength="160" required /></label>
                <label>Phone number *<input type="tel" value={form.applicantPhone} onChange={update('applicantPhone')} placeholder="+91 98765 43210" maxLength="24" required /></label>
                <label>Preferred contact<select value={form.preferredContactMethod} onChange={update('preferredContactMethod')}><option value="phone">Phone</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label>
              </div>

              <div className="form-section-title"><span>02</span><div><strong>Business profile</strong><small>Help us understand your operating background.</small></div></div>
              <div className="apply-grid">
                <label>Business / brand name *<input value={form.businessName} onChange={update('businessName')} maxLength="180" required /></label>
                <label>Registered business name<input value={form.registeredBusinessName} onChange={update('registeredBusinessName')} maxLength="180" /></label>
                <label>Business type<select value={form.businessType} onChange={update('businessType')}><option value="">Select</option><option value="individual">Individual proprietor</option><option value="partnership">Partnership</option><option value="company">Company</option><option value="logistics">Logistics business</option><option value="other">Other</option></select></label>
                <label>Expected monthly shipments<input value={form.expectedMonthlyShipments} onChange={update('expectedMonthlyShipments')} placeholder="e.g. 2,000–5,000" maxLength="40" /></label>
                <label>Current city<input value={form.currentCity} onChange={update('currentCity')} maxLength="120" /></label>
                <label>Current state<input value={form.currentState} onChange={update('currentState')} maxLength="120" /></label>
              </div>

              <div className="form-section-title"><span>03</span><div><strong>Plan and territory</strong><small>Only currently available combinations are shown.</small></div></div>
              <div className="apply-grid">
                <label>Franchise plan *<select value={form.productId} onChange={update('productId')} required><option value="">Select a plan</option>{opportunities.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.durationMonths} months</option>)}</select></label>
                <label>Available territory *<select value={form.geoUnitId} onChange={update('geoUnitId')} disabled={!form.productId} required><option value="">{form.productId ? 'Select a territory' : 'Choose a plan first'}</option>{matchingTerritories.map((territory) => <option key={territory.id} value={territory.id}>{territoryLabel(territory)}</option>)}</select></label>
              </div>
              {selectedProduct?.description && <p className="plan-note">{selectedProduct.description}</p>}

              <div className="form-section-title"><span>04</span><div><strong>Experience and context</strong><small>Optional details help us review your request faster.</small></div></div>
              <label>Relevant business or logistics experience<textarea rows="4" value={form.experience} onChange={update('experience')} maxLength="1000" /></label>
              <label>Anything else we should know?<textarea rows="4" value={form.message} onChange={update('message')} maxLength="2000" /></label>
              <label className="honeypot" aria-hidden="true">Website<input tabIndex="-1" autoComplete="off" value={form.website} onChange={update('website')} /></label>
              <label className="consent-row"><input type="checkbox" checked={form.consent} onChange={update('consent')} required /><span>I consent to ShipBees contacting me about this franchise application and reviewing the submitted business details.</span></label>
              {submitError && <div className="form-error"><AlertTriangle size={17} />{submitError}</div>}
              <button className="primary-button submit-application" type="submit" disabled={submitting}>
                {submitting ? <><LoaderCircle className="spin" size={18} /> Submitting…</> : <>Submit application <ArrowRight size={18} /></>}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
