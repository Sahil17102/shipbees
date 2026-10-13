import { pool } from '../models/client'

const targetEmail = String(process.argv[2] || process.env.APPROVE_MERCHANT_EMAIL || '')
  .trim()
  .toLowerCase()

if (!targetEmail) {
  throw new Error(
    'Merchant email is required. Run: npm run approve:merchant -- merchant@example.com',
  )
}

async function approveMerchantAccount() {
  const client = await pool.connect()

  try {
    await client.query('begin')

    const userResult = await client.query<{
      id: string
      email: string
      role: string | null
    }>(
      `select id, email, role
       from users
       where lower(email) = $1
       for update`,
      [targetEmail],
    )
    const user = userResult.rows[0]

    if (!user) {
      throw new Error(`No user found for ${targetEmail}`)
    }
    if (user.role !== 'customer') {
      throw new Error(`User ${targetEmail} is not a customer account`)
    }

    await client.query(
      `update users
       set "emailVerified" = true,
           "phoneVerified" = true,
           "accountVerified" = true,
           "updatedAt" = now()
       where id = $1`,
      [user.id],
    )

    const profileResult = await client.query(
      `update user_profiles
       set approved = true,
           "onboardingComplete" = true,
           "profileComplete" = true,
           "onboardingStep" = -1,
           "approvedAt" = coalesce("approvedAt", now()),
           "rejectionReason" = null,
           "domesticKyc" = jsonb_build_object(
             'status', 'verified',
             'updatedAt', to_jsonb(now())
           ),
           "companyInfo" = jsonb_set(
             jsonb_set(
               coalesce("companyInfo", '{}'::jsonb),
               '{POCEmailVerified}',
               'true'::jsonb,
               true
             ),
             '{POCPhoneVerified}',
             'true'::jsonb,
             true
           ),
           "updatedAt" = now()
       where "userId" = $1
       returning id`,
      [user.id],
    )

    if (profileResult.rowCount !== 1) {
      throw new Error(`Merchant profile is missing for ${targetEmail}`)
    }

    await client.query(
      `insert into kyc (
         "userId",
         status,
         "panCardStatus",
         "aadhaarStatus",
         "cancelledChequeStatus",
         "companyAddressProofStatus",
         "boardResolutionStatus",
         "partnershipDeedStatus",
         "cinStatus",
         "llpAgreementStatus",
         "businessPanStatus",
         "gstCertificateStatus",
         "cancelledChequeRejectionReason",
         "updatedAt"
       )
       values (
         $1,
         'verified',
         'verified',
         'verified',
         'verified',
         'verified',
         'verified',
         'verified',
         'verified',
         'verified',
         'verified',
         'verified',
         '',
         now()
       )
       on conflict ("userId") do update
       set status = 'verified',
           "panCardStatus" = 'verified',
           "aadhaarStatus" = 'verified',
           "cancelledChequeStatus" = 'verified',
           "companyAddressProofStatus" = 'verified',
           "boardResolutionStatus" = 'verified',
           "partnershipDeedStatus" = 'verified',
           "cinStatus" = 'verified',
           "llpAgreementStatus" = 'verified',
           "businessPanStatus" = 'verified',
           "gstCertificateStatus" = 'verified',
           "panCardRejectionReason" = null,
           "aadhaarRejectionReason" = null,
           "cancelledChequeRejectionReason" = '',
           "boardResolutionRejectionReason" = null,
           "partnershipDeedRejectionReason" = null,
           "cinRejectionReason" = null,
           "llpAgreementRejectionReason" = null,
           "businessPanRejectionReason" = null,
           "gstCertificateRejectionReason" = null,
           "rejectionReason" = null,
           "updatedAt" = now()`,
      [user.id],
    )

    const bankResult = await client.query(
      `update bank_accounts
       set status = 'verified',
           "rejectionReason" = null
       where "userId" = $1`,
      [user.id],
    )

    await client.query('commit')

    const verificationResult = await client.query(
      `select
         u.email,
         u."emailVerified",
         u."phoneVerified",
         u."accountVerified",
         p.approved,
         p."onboardingComplete",
         p."profileComplete",
         p."onboardingStep",
         p."companyInfo" ->> 'POCEmailVerified' as "pocEmailVerified",
         p."companyInfo" ->> 'POCPhoneVerified' as "pocPhoneVerified",
         p."domesticKyc" ->> 'status' as "profileKycStatus",
         k.status as "kycStatus",
         (
           select bool_and(document_status = 'verified')
           from unnest(array[
             k."panCardStatus",
             k."aadhaarStatus",
             k."cancelledChequeStatus",
             k."companyAddressProofStatus",
             k."boardResolutionStatus",
             k."partnershipDeedStatus",
             k."cinStatus",
             k."llpAgreementStatus",
             k."businessPanStatus",
             k."gstCertificateStatus"
           ]) as document_status
         ) as "allKycDocumentsVerified"
       from users u
       join user_profiles p on p."userId" = u.id
       join kyc k on k."userId" = u.id
       where u.id = $1`,
      [user.id],
    )

    console.log('Merchant account approved successfully')
    console.log(
      JSON.stringify(
        {
          ...verificationResult.rows[0],
          verifiedBankAccounts: bankResult.rowCount,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

approveMerchantAccount()
  .catch((error) => {
    console.error('Failed to approve merchant account:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
