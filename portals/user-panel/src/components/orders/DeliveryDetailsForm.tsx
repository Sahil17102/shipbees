/* eslint-disable @typescript-eslint/no-explicit-any */
import { CircularProgress, Grid, MenuItem, TextField } from '@mui/material'
import { useEffect } from 'react'
import { Controller, type FieldErrors, useFormContext } from 'react-hook-form'
import { normalizePincode, type ServiceabilityLocation } from '../../api/locations'
import { useLocations } from '../../hooks/useLocations'
import { SHIPPING_COUNTRIES } from '../../constants/internationalCountries'
import CustomInput from '../UI/inputs/CustomInput'
import type { B2BFormData } from './b2b/B2BOrderForm'
import type { B2CFormData } from './b2c/B2COrderForm'

type FormType = 'b2b' | 'b2c'

const getExactLocation = (rows: ServiceabilityLocation[] = [], pincode: string) =>
  rows.find((row) => String(row?.pincode || '') === pincode) ?? rows[0]

const DeliveryDetailsForm = ({ type = 'b2c' }: { type?: FormType }) => {
  const {
    control,
    setValue,
    watch,
    setError,
    clearErrors,
    getValues,
    formState: { errors },
  } = useFormContext<B2CFormData | B2BFormData>()

  const pincode = watch('pincode')
  const country = watch('country') || 'India'
  const isIndia = country === 'India'
  const normalizedPincode = isIndia
    ? normalizePincode(pincode)
    : String(pincode || '').toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 12)

  const {
    data: locationData,
    isFetching: pinFetching,
    isError,
  } = useLocations(
    { pincode: normalizedPincode },
    isIndia && Boolean(/^\d{6}$/.test(normalizedPincode)),
    ['locationLookup', normalizedPincode],
  )

  useEffect(() => {
    if (!isIndia) {
      clearErrors('pincode')
      return
    }
    if (!/^\d{6}$/.test(normalizedPincode)) {
      clearErrors('pincode')
      setValue('city', '', { shouldValidate: false })
      setValue('state', '', { shouldValidate: false })
      return
    }

    if (isError) {
      setError('pincode', { type: 'manual', message: 'PIN lookup failed' })
      return
    }

    if (locationData) {
      const rows: ServiceabilityLocation[] = Array.isArray(locationData?.data)
        ? locationData.data
        : []
      const location = getExactLocation(rows, normalizedPincode)
      const city = location?.city
      const state = location?.state

      if (!city || !state) {
        setError('pincode', { type: 'manual', message: 'Invalid pincode' })
        setValue('city', '', { shouldValidate: false })
        setValue('state', '', { shouldValidate: false })
      } else {
        clearErrors('pincode')
        setValue('city', city, { shouldValidate: true })
        setValue('state', state, { shouldValidate: true })
      }
    }
  }, [locationData, isError, isIndia, normalizedPincode, setError, clearErrors, setValue, getValues])

  const fields = [
    { name: 'buyerName', label: 'Name' },
    { name: 'buyerPhone', label: 'Phone' },
    { name: 'buyerEmail', label: 'Email' },
    { name: 'pincode', label: isIndia ? 'PIN code' : 'Postal / ZIP code' },
    { name: 'city', label: 'City' },
    { name: 'state', label: 'State' },
    { name: 'address', label: 'Address' },
    { name: 'addressLocality', label: 'Locality / Landmark' },
    ...(type === 'b2b'
      ? [
          { name: 'companyName', label: 'Company Name' },
          { name: 'gstin', label: 'GSTIN (Optional)' },
        ]
      : []),
  ] as const

  const getFieldError = (fieldName: string) => {
    return (errors as FieldErrors<B2CFormData & B2BFormData>)[
      fieldName as keyof (B2CFormData & B2BFormData)
    ]?.message
  }

  return (
    <Grid container spacing={0.65}>
      <Grid size={{ xs: 12, sm: 6, md: 4, xl: 2 }}>
        <Controller
          name="country"
          control={control}
          rules={{ required: 'Country is required' }}
          render={({ field }) => (
            <TextField
              {...field}
              select
              fullWidth
              required
              size="small"
              label="Country"
              value={field.value || 'India'}
              error={!!getFieldError('country')}
              helperText={getFieldError('country')}
              onChange={(event) => {
                field.onChange(event.target.value)
                setValue('pincode', '', { shouldValidate: false })
                setValue('city', '', { shouldValidate: false })
                setValue('state', '', { shouldValidate: false })
                if (type === 'b2c' && event.target.value !== 'India') {
                  setValue('orderType', 'prepaid' as any, { shouldValidate: true })
                }
              }}
            >
              {SHIPPING_COUNTRIES.map((item) => <MenuItem key={item.code} value={item.name}>{item.name}</MenuItem>)}
            </TextField>
          )}
        />
      </Grid>
      {fields.map((fieldItem) => {
        const isNonEditable = isIndia && (fieldItem.name === 'city' || fieldItem.name === 'state')
        const showLoader = fieldItem.name === 'pincode' ? pinFetching : false
        const isOptionalField =
          fieldItem.name === 'buyerEmail' ||
          fieldItem.name === 'gstin' ||
          fieldItem.name === 'addressLocality'
        const isAddressField = fieldItem.name === 'address'

        return (
          <Grid
            key={fieldItem.name}
            size={{
              xs: 12,
              sm: isAddressField ? 12 : 6,
              md: isAddressField ? 12 : 4,
              xl: isAddressField ? 4 : 2,
            }}
          >
            <Controller
              name={fieldItem.name as keyof (B2CFormData & B2BFormData)}
              control={control}
              rules={{
                ...(!isOptionalField ? { required: `${fieldItem.label} is required` } : {}),
                ...(fieldItem.name === 'buyerPhone' && {
                  pattern: isIndia
                    ? { value: /^[0-9]{10}$/, message: 'Enter valid 10-digit phone' }
                    : { value: /^\+?[0-9 -]{7,16}$/, message: 'Enter a valid international phone number' },
                }),
                ...(fieldItem.name === 'pincode' && {
                  pattern: isIndia
                    ? { value: /^\d{6}$/, message: 'Enter 6-digit pincode' }
                    : { value: /^[A-Z0-9][A-Z0-9 -]{1,11}$/i, message: 'Enter a valid postal / ZIP code' },
                }),
              }}
              render={({ field }) => (
                <CustomInput
                  label={fieldItem.label}
                  required={!isOptionalField}
                  {...field}
                  onChange={(event) => {
                    if (fieldItem.name === 'pincode') {
                      field.onChange(event.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, isIndia ? 6 : 12))
                      return
                    }
                    field.onChange(event)
                  }}
                  multiline={isAddressField}
                  rows={isAddressField ? 1 : undefined}
                  maxLength={isAddressField ? 200 : undefined}
                  inputMode={fieldItem.name === 'pincode' ? (isIndia ? 'numeric' : 'text') : undefined}
                  placeholder={fieldItem.name === 'pincode' && !isIndia ? 'e.g. A0A 1A1' : undefined}
                  disabled={isNonEditable}
                  error={!!getFieldError(fieldItem.name)}
                  helperText={getFieldError(fieldItem.name)}
                  postfix={showLoader ? <CircularProgress size={16} /> : null}
                  topMargin={false}
                  dense
                />
              )}
            />
          </Grid>
        )
      })}
    </Grid>
  )
}

export default DeliveryDetailsForm
