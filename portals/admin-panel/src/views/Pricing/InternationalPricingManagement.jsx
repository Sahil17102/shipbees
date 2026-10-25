import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Spinner,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconEdit,
  IconGlobe,
  IconPlaneDeparture,
  IconSearch,
  IconShieldCheck,
} from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { internationalRatesService } from '../../services/internationalRates.service'

const money = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const countryFlag = (code = '') =>
  code
    .toUpperCase()
    .split('')
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('')

const numericFields = [
  ['baseWeightKg', 'Base weight (kg)'],
  ['baseRate', 'Base rate'],
  ['additionalRatePerKg', 'Additional / kg'],
  ['fuelSurchargePercent', 'Fuel surcharge (%)'],
  ['handlingFee', 'Handling fee'],
  ['customsClearanceFee', 'Customs clearance fee'],
  ['insurancePercent', 'Insurance (%)'],
  ['taxPercent', 'Shipping tax / GST (%)'],
]

const InternationalPricingManagement = () => {
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const softBg = useColorModeValue('purple.50', 'whiteAlpha.100')
  const tableHeadBg = useColorModeValue('gray.50', 'gray.900')
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('All regions')
  const [courier, setCourier] = useState('All couriers')
  const [status, setStatus] = useState('Active')
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: rates = [], isLoading, isError } = useQuery({
    queryKey: ['international-rates'],
    queryFn: internationalRatesService.list,
  })

  const updateRate = useMutation({
    mutationFn: ({ id, payload }) => internationalRatesService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['international-rates'] })
      toast({ title: 'International rate updated', status: 'success', duration: 2500 })
      onClose()
    },
    onError: (error) =>
      toast({
        title: 'Rate could not be saved',
        description: error?.response?.data?.message || error.message,
        status: 'error',
        duration: 4000,
      }),
  })

  const regions = useMemo(() => [...new Set(rates.map((item) => item.region))], [rates])
  const couriers = useMemo(() => [...new Set(rates.map((item) => item.courierName))], [rates])
  const filteredRates = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rates.filter((item) => {
      const matchesSearch =
        !term ||
        item.countryName.toLowerCase().includes(term) ||
        item.countryCode.toLowerCase().includes(term) ||
        item.courierName.toLowerCase().includes(term)
      return (
        matchesSearch &&
        (region === 'All regions' || item.region === region) &&
        (courier === 'All couriers' || item.courierName === courier) &&
        (status === 'All' || item.isActive === (status === 'Active'))
      )
    })
  }, [rates, search, region, courier, status])

  const openEditor = (rate) => {
    setEditing({ ...rate })
    onOpen()
  }

  const updateField = (field, value) => setEditing((current) => ({ ...current, [field]: value }))
  const save = () => {
    const payload = { ...editing }
    numericFields.forEach(([field]) => {
      payload[field] = Number(payload[field])
    })
    updateRate.mutate({ id: editing.id, payload })
  }

  const activeCount = rates.filter((item) => item.isActive).length
  const countryCount = new Set(rates.map((item) => item.countryCode)).size

  return (
    <Box pt={{ base: '130px', md: '80px' }} px={{ base: 4, md: 6 }} pb={10}>
      <Flex justify="space-between" align={{ base: 'flex-start', lg: 'center' }} gap={4} mb={6} direction={{ base: 'column', lg: 'row' }}>
        <Box>
          <Flex align="center" gap={3} mb={2}>
            <Flex w="42px" h="42px" align="center" justify="center" borderRadius="12px" bg="purple.500" color="white">
              <IconGlobe size={23} />
            </Flex>
            <Heading size="lg">International Pricing</Heading>
          </Flex>
          <Text color="gray.600" fontSize="sm">
            Country-wise courier rates, export charges and tax settings in one place
          </Text>
        </Box>
        <Badge px={4} py={2} borderRadius="full" colorScheme="purple" textTransform="none" fontSize="sm">
          Rates from India · INR
        </Badge>
      </Flex>

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4} mb={6}>
        <Stat bg={cardBg} borderWidth="1px" borderColor={borderColor} borderRadius="xl" p={5}>
          <StatLabel color="gray.500">Countries covered</StatLabel>
          <StatNumber>{countryCount}</StatNumber>
          <StatHelpText mb={0}>Europe + key global markets</StatHelpText>
        </Stat>
        <Stat bg={cardBg} borderWidth="1px" borderColor={borderColor} borderRadius="xl" p={5}>
          <StatLabel color="gray.500">Courier services</StatLabel>
          <StatNumber>{couriers.length}</StatNumber>
          <StatHelpText mb={0}>Independent rate cards</StatHelpText>
        </Stat>
        <Stat bg={cardBg} borderWidth="1px" borderColor={borderColor} borderRadius="xl" p={5}>
          <StatLabel color="gray.500">Active rate cards</StatLabel>
          <StatNumber>{activeCount}</StatNumber>
          <StatHelpText mb={0}>Ready for quotations</StatHelpText>
        </Stat>
        <Stat bg={softBg} borderWidth="1px" borderColor="purple.200" borderRadius="xl" p={5}>
          <StatLabel color="purple.600">Default export tax</StatLabel>
          <StatNumber>18%</StatNumber>
          <StatHelpText mb={0}>Editable per courier & country</StatHelpText>
        </Stat>
      </SimpleGrid>

      <Box bg={cardBg} borderWidth="1px" borderColor={borderColor} borderRadius="xl" overflow="hidden" shadow="sm">
        <Flex p={5} gap={3} direction={{ base: 'column', xl: 'row' }} borderBottomWidth="1px" borderColor={borderColor}>
          <InputGroup flex="2">
            <InputLeftElement pointerEvents="none"><IconSearch size={18} color="#718096" /></InputLeftElement>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search country, code or courier" />
          </InputGroup>
          <Select value={region} onChange={(event) => setRegion(event.target.value)} flex="1">
            <option>All regions</option>
            {regions.map((item) => <option key={item}>{item}</option>)}
          </Select>
          <Select value={courier} onChange={(event) => setCourier(event.target.value)} flex="1">
            <option>All couriers</option>
            {couriers.map((item) => <option key={item}>{item}</option>)}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} maxW={{ xl: '160px' }}>
            <option>Active</option><option>Inactive</option><option>All</option>
          </Select>
        </Flex>

        {isLoading ? (
          <Flex minH="300px" align="center" justify="center"><Spinner color="purple.500" size="lg" /></Flex>
        ) : isError ? (
          <Flex minH="240px" align="center" justify="center" direction="column" gap={2}>
            <Text fontWeight="700">International rates are temporarily unavailable</Text>
            <Text color="gray.500" fontSize="sm">Please refresh after the backend deployment finishes.</Text>
          </Flex>
        ) : (
          <Box overflowX="auto">
            <Table variant="simple" size="sm" minW="1050px">
              <Thead bg={tableHeadBg}>
                <Tr>
                  <Th>Destination</Th><Th>Courier service</Th><Th isNumeric>Base slab</Th>
                  <Th isNumeric>Additional / kg</Th><Th isNumeric>Fuel</Th><Th isNumeric>Tax</Th>
                  <Th>Duties</Th><Th>Status</Th><Th textAlign="right">Action</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRates.map((rate) => (
                  <Tr key={rate.id} _hover={{ bg: softBg }}>
                    <Td>
                      <Flex align="center" gap={3}>
                        <Text fontSize="xl">{countryFlag(rate.countryCode)}</Text>
                        <Box><Text fontWeight="700">{rate.countryName}</Text><Text fontSize="xs" color="gray.500">{rate.region} · {rate.countryCode}</Text></Box>
                      </Flex>
                    </Td>
                    <Td><Text fontWeight="600">{rate.courierName}</Text><Text fontSize="xs" color="gray.500">{rate.serviceType}</Text></Td>
                    <Td isNumeric><Text fontWeight="700">{money(rate.baseRate, rate.currency)}</Text><Text fontSize="xs" color="gray.500">up to {rate.baseWeightKg} kg</Text></Td>
                    <Td isNumeric>{money(rate.additionalRatePerKg, rate.currency)}</Td>
                    <Td isNumeric>{rate.fuelSurchargePercent}%</Td>
                    <Td isNumeric>{rate.taxPercent}%</Td>
                    <Td><Badge colorScheme={rate.dutiesMode === 'DDP' ? 'green' : 'orange'}>{rate.dutiesMode}</Badge></Td>
                    <Td><Badge colorScheme={rate.isActive ? 'green' : 'gray'}>{rate.isActive ? 'Active' : 'Paused'}</Badge></Td>
                    <Td textAlign="right"><Button size="sm" variant="outline" colorScheme="purple" leftIcon={<IconEdit size={15} />} onClick={() => openEditor(rate)}>Edit</Button></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {!filteredRates.length && <Text textAlign="center" color="gray.500" py={12}>No rate cards match these filters.</Text>}
          </Box>
        )}
      </Box>

      <Box mt={5} p={4} borderRadius="lg" bg="blue.50" color="blue.900" borderWidth="1px" borderColor="blue.100">
        <Flex gap={3} align="flex-start"><IconShieldCheck size={21} /><Text fontSize="sm"><b>Tax note:</b> 18% is a configurable shipping GST placeholder. Destination customs duty and import tax vary by product, HS code and shipment value; choose DDU or DDP per rate card and confirm the final duty during booking.</Text></Flex>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Flex align="center" gap={3}><IconPlaneDeparture size={22} /> Edit {editing?.countryName} · {editing?.courierName}</Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {editing && (
              <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={5}>
                <GridItem><FormControl><FormLabel>Currency</FormLabel><Select value={editing.currency} onChange={(e) => updateField('currency', e.target.value)}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></Select></FormControl></GridItem>
                <GridItem><FormControl><FormLabel>Duties model</FormLabel><Select value={editing.dutiesMode} onChange={(e) => updateField('dutiesMode', e.target.value)}><option value="DDU">DDU · Receiver pays duties</option><option value="DDP">DDP · Sender pays duties</option></Select></FormControl></GridItem>
                {numericFields.map(([field, label]) => (
                  <GridItem key={field}><FormControl><FormLabel>{label}</FormLabel><Input type="number" min="0" step="0.01" value={editing[field]} onChange={(e) => updateField(field, e.target.value)} /></FormControl></GridItem>
                ))}
                <GridItem colSpan={{ base: 1, md: 2 }}><Checkbox isChecked={editing.isActive} onChange={(e) => updateField('isActive', e.target.checked)} colorScheme="purple">Rate card is active and available for quotation</Checkbox></GridItem>
              </Grid>
            )}
          </ModalBody>
          <ModalFooter gap={3}><Button variant="ghost" onClick={onClose}>Cancel</Button><Button colorScheme="purple" onClick={save} isLoading={updateRate.isPending}>Save rate card</Button></ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default InternationalPricingManagement
