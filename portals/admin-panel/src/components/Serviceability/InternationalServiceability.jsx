import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  Heading,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Select,
  SimpleGrid,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconDatabaseImport, IconEdit, IconMapPinCheck, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useDebounce } from '../../hooks/useDebounce'
import { internationalServiceabilityService } from '../../services/internationalServiceability.service'

const emptyRule = {
  countryCode: '', countryName: '', region: 'Europe', courierName: 'DilliKing',
  postalPattern: '', postalFormat: '', postalExample: '', coverageType: 'custom', isActive: true,
}

const flag = (code = '') => code.toUpperCase().split('').map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('')

const InternationalServiceability = () => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const modal = useDisclosure()
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('All regions')
  const [form, setForm] = useState(emptyRule)
  const [editingId, setEditingId] = useState(null)
  const [check, setCheck] = useState({ countryCode: 'AU', postalCode: '2000' })
  const [checkResult, setCheckResult] = useState(null)
  const [postalSearch, setPostalSearch] = useState('')
  const [postalCountry, setPostalCountry] = useState('')
  const [postalPage, setPostalPage] = useState(1)
  const debouncedPostalSearch = useDebounce(postalSearch.trim(), 350)

  const { data: coverage = {}, isLoading } = useQuery({
    queryKey: ['international-serviceability'],
    queryFn: internationalServiceabilityService.list,
    refetchInterval: (query) => query.state.data?.stats?.sync?.status === 'running' ? 5000 : false,
  })
  const rules = coverage.rules || []
  const stats = coverage.stats || {}
  const { data: postalResult = {}, isLoading: postalLoading, isFetching: postalFetching } = useQuery({
    queryKey: ['international-postal-codes', postalCountry, debouncedPostalSearch, postalPage],
    queryFn: ({ signal }) => internationalServiceabilityService.listPostalCodes({
      countryCode: postalCountry || undefined,
      search: debouncedPostalSearch.length >= 2 ? debouncedPostalSearch : undefined,
      page: postalPage,
      limit: 50,
    }, signal),
    placeholderData: (previousData) => previousData,
    staleTime: 60 * 1000,
  })
  const postalCodes = postalResult.data || []
  const pagination = postalResult.pagination || { page: 1, total: 0, totalPages: 1 }
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['international-serviceability'] })
  const saveMutation = useMutation({
    mutationFn: (payload) => editingId
      ? internationalServiceabilityService.update(editingId, payload)
      : internationalServiceabilityService.create(payload),
    onSuccess: () => { refresh(); modal.onClose(); toast({ title: 'Postal coverage rule saved', status: 'success' }) },
    onError: (error) => toast({ title: 'Could not save postal rule', description: error?.response?.data?.message || error.message, status: 'error' }),
  })
  const deleteMutation = useMutation({
    mutationFn: internationalServiceabilityService.remove,
    onSuccess: () => { refresh(); toast({ title: 'Postal rule removed', status: 'success' }) },
  })
  const checkMutation = useMutation({
    mutationFn: internationalServiceabilityService.check,
    onSuccess: setCheckResult,
    onError: (error) => toast({ title: 'Could not check postal code', description: error.message, status: 'error' }),
  })
  const syncMutation = useMutation({
    mutationFn: internationalServiceabilityService.startSync,
    onSuccess: () => {
      refresh()
      toast({ title: 'Postal directory sync started', description: 'GeoNames records are importing in the background.', status: 'info' })
    },
    onError: (error) => toast({ title: 'Could not start postal sync', description: error?.response?.data?.message || error.message, status: 'error' }),
  })

  const regions = useMemo(() => [...new Set(rules.map((item) => item.region))], [rules])
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rules.filter((item) =>
      (region === 'All regions' || item.region === region) &&
      (!term || [item.countryName, item.countryCode, item.courierName, item.postalExample].some((value) => String(value).toLowerCase().includes(term))),
    )
  }, [rules, search, region])

  const openAdd = () => { setEditingId(null); setForm(emptyRule); modal.onOpen() }
  const openEdit = (rule) => { setEditingId(rule.id); setForm({ ...rule }); modal.onOpen() }

  return (
    <Box>
      <Flex justify="space-between" align={{ base: 'flex-start', lg: 'center' }} direction={{ base: 'column', lg: 'row' }} gap={4} mb={5}>
        <Box><Heading size="md">International postal directory</Heading><Text color="gray.600" fontSize="sm">Searchable postal codes for supported international destinations, backed by GeoNames data.</Text></Box>
        <Flex gap={2} wrap="wrap">
          <Button leftIcon={<IconDatabaseImport size={17} />} colorScheme="blue" onClick={() => syncMutation.mutate()} isLoading={syncMutation.isPending || stats.sync?.status === 'running'} loadingText="Syncing">Sync postal directory</Button>
          <Button leftIcon={<IconPlus size={17} />} colorScheme="purple" onClick={openAdd}>Add postal rule</Button>
        </Flex>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={5}>
        <Stat bg="white" borderWidth="1px" borderRadius="lg" p={4}><StatLabel>Postal codes loaded</StatLabel><StatNumber>{Number(stats.totalPostalCodes || 0).toLocaleString()}</StatNumber></Stat>
        <Stat bg="white" borderWidth="1px" borderRadius="lg" p={4}><StatLabel>Countries indexed</StatLabel><StatNumber>{stats.countriesWithPostalCodes || 0}</StatNumber></Stat>
        <Stat bg="white" borderWidth="1px" borderRadius="lg" p={4}><StatLabel>Active coverage rules</StatLabel><StatNumber>{rules.filter((rule) => rule.isActive).length}</StatNumber></Stat>
      </SimpleGrid>
      {stats.sync?.status === 'running' && <Box mb={5}><Progress size="sm" isIndeterminate colorScheme="purple" borderRadius="full" /><Text mt={1} fontSize="xs" color="gray.600">Countries {stats.sync.countriesCompleted || 0}/{stats.sync.countriesTotal || rules.length} · processed {Number(stats.sync.processed || 0).toLocaleString()} rows · imported {Number(stats.sync.imported || 0).toLocaleString()} postal codes</Text></Box>}
      {stats.sync?.status === 'failed' && <Text mb={5} color="red.600" fontSize="sm">Last sync failed: {stats.sync.error}</Text>}

      <Box bg="blue.50" borderWidth="1px" borderColor="blue.100" borderRadius="lg" p={4} mb={5}>
        <Flex gap={3} align={{ base: 'stretch', md: 'flex-end' }} direction={{ base: 'column', md: 'row' }}>
          <FormControl><FormLabel fontSize="sm">Country</FormLabel><Select bg="white" value={check.countryCode} onChange={(e) => setCheck((v) => ({ ...v, countryCode: e.target.value }))}>{[...new Map(rules.map((r) => [r.countryCode, r])).values()].map((r) => <option key={r.countryCode} value={r.countryCode}>{r.countryName}</option>)}</Select></FormControl>
          <FormControl><FormLabel fontSize="sm">Postal / ZIP code</FormLabel><Input bg="white" value={check.postalCode} onChange={(e) => setCheck((v) => ({ ...v, postalCode: e.target.value }))} placeholder="e.g. SW1A 1AA" /></FormControl>
          <Button minW="155px" leftIcon={<IconMapPinCheck size={17} />} colorScheme="blue" onClick={() => checkMutation.mutate(check)} isLoading={checkMutation.isPending}>Check coverage</Button>
        </Flex>
        {checkResult && <Badge mt={3} px={3} py={1} colorScheme={checkResult.serviceable ? 'green' : 'red'}>{checkResult.serviceable ? `Serviceable by ${checkResult.matches.map((m) => m.courierName).join(', ')}` : 'Not serviceable'}</Badge>}
      </Box>

      <Box mb={7}>
        <Flex align="center" gap={2} mb={3}>
          <Heading size="sm">Postal codes</Heading>
          {postalFetching && !postalLoading && <><Spinner size="xs" color="purple.500" /><Text fontSize="xs" color="gray.500">Updating results…</Text></>}
        </Flex>
        <Flex gap={3} mb={4} direction={{ base: 'column', md: 'row' }}>
          <Flex align="center" gap={2} flex="2" borderWidth="1px" borderRadius="md" px={3}><IconSearch size={17} color="#718096" /><Input border="0" boxShadow="none" value={postalSearch} onChange={(e) => { setPostalSearch(e.target.value); setPostalPage(1) }} placeholder="Search postal code, city or state" /></Flex>
          <Select value={postalCountry} onChange={(e) => { setPostalCountry(e.target.value); setPostalPage(1) }} flex="1"><option value="">All countries</option>{[...new Map(rules.map((r) => [r.countryCode, r])).values()].map((r) => <option key={r.countryCode} value={r.countryCode}>{r.countryName} ({Number(stats.countsByCountry?.[r.countryCode] || 0).toLocaleString()})</option>)}</Select>
        </Flex>
        {postalLoading ? <Flex py={12} justify="center"><Spinner color="purple.500" /></Flex> : postalCodes.length ? (
          <Box overflowX="auto" borderWidth="1px" borderRadius="lg">
            <Table size="sm" minW="760px"><Thead bg="gray.50"><Tr><Th>Postal / ZIP code</Th><Th>City / place</Th><Th>State / region</Th><Th>Country</Th><Th>Source</Th></Tr></Thead>
              <Tbody>{postalCodes.map((item) => <Tr key={`${item.countryCode}-${item.postalCode}`}><Td fontWeight="700">{item.postalCode}</Td><Td>{item.placeName || '—'}</Td><Td>{item.adminName || '—'}</Td><Td>{flag(item.countryCode)} {rules.find((r) => r.countryCode === item.countryCode)?.countryName || item.countryCode}</Td><Td><Badge colorScheme="blue">{item.source}</Badge></Td></Tr>)}</Tbody>
            </Table>
            <Flex justify="space-between" align="center" px={4} py={3} borderTopWidth="1px"><Text fontSize="sm" color="gray.600">{Number(pagination.total || 0).toLocaleString()} matching postal codes · Page {pagination.page} of {pagination.totalPages}</Text><Flex gap={2}><Button size="sm" isDisabled={postalPage <= 1} onClick={() => setPostalPage((page) => Math.max(1, page - 1))}>Previous</Button><Button size="sm" isDisabled={postalPage >= pagination.totalPages} onClick={() => setPostalPage((page) => page + 1)}>Next</Button></Flex></Flex>
          </Box>
        ) : <Box borderWidth="1px" borderRadius="lg" py={10} textAlign="center"><Text fontWeight="700">No postal codes loaded yet</Text><Text color="gray.600" fontSize="sm">Use “Sync postal directory” to import supported countries from GeoNames.</Text></Box>}
        <Text mt={2} fontSize="xs" color="gray.500">Source: GeoNames postal code data, licensed under CC BY 4.0. Courier acceptance is still confirmed at booking.</Text>
      </Box>

      <Heading size="sm" mb={3}>Coverage rules</Heading>
      <Flex gap={3} mb={4} direction={{ base: 'column', md: 'row' }}>
        <Flex align="center" gap={2} flex="2" borderWidth="1px" borderRadius="md" px={3}><IconSearch size={17} color="#718096" /><Input border="0" boxShadow="none" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search country, courier or example" /></Flex>
        <Select value={region} onChange={(e) => setRegion(e.target.value)} flex="1"><option>All regions</option>{regions.map((item) => <option key={item}>{item}</option>)}</Select>
      </Flex>

      {isLoading ? <Flex py={16} justify="center"><Spinner color="purple.500" /></Flex> : (
        <Box overflowX="auto" borderWidth="1px" borderRadius="lg">
          <Table size="sm" minW="900px">
            <Thead bg="gray.50"><Tr><Th>Country</Th><Th>Courier</Th><Th>Postal format</Th><Th>Example</Th><Th>Coverage</Th><Th>Status</Th><Th textAlign="right">Actions</Th></Tr></Thead>
            <Tbody>{filtered.map((rule) => <Tr key={rule.id}>
              <Td><Flex gap={2} align="center"><Text fontSize="lg">{flag(rule.countryCode)}</Text><Box><Text fontWeight="700">{rule.countryName}</Text><Text fontSize="xs" color="gray.500">{rule.region} · {rule.countryCode}</Text></Box></Flex></Td>
              <Td>{rule.courierName}</Td><Td><Text fontWeight="600">{rule.postalFormat}</Text><Text fontFamily="mono" fontSize="xs" color="gray.500">{rule.postalPattern}</Text></Td><Td>{rule.postalExample}</Td>
              <Td><Badge colorScheme="purple">{rule.coverageType}</Badge></Td><Td><Badge colorScheme={rule.isActive ? 'green' : 'gray'}>{rule.isActive ? 'Active' : 'Paused'}</Badge></Td>
              <Td textAlign="right"><Button size="xs" mr={2} leftIcon={<IconEdit size={14} />} onClick={() => openEdit(rule)}>Edit</Button><Button size="xs" colorScheme="red" variant="ghost" leftIcon={<IconTrash size={14} />} onClick={() => window.confirm(`Remove ${rule.countryName} postal rule?`) && deleteMutation.mutate(rule.id)}>Remove</Button></Td>
            </Tr>)}</Tbody>
          </Table>
        </Box>
      )}
      <Text mt={3} fontSize="xs" color="gray.500">{rules.length} rules loaded · {new Set(rules.map((item) => item.countryCode)).size} countries · destination coverage must still be confirmed by the courier when booking.</Text>

      <Modal isOpen={modal.isOpen} onClose={modal.onClose} size="2xl"><ModalOverlay /><ModalContent><ModalHeader>{editingId ? 'Edit postal coverage' : 'Add postal coverage'}</ModalHeader><ModalCloseButton /><ModalBody>
        <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
          <FormControl isDisabled={Boolean(editingId)}><FormLabel>Country code</FormLabel><Input value={form.countryCode} maxLength={2} onChange={(e) => setForm((v) => ({ ...v, countryCode: e.target.value.toUpperCase() }))} /></FormControl>
          <FormControl isDisabled={Boolean(editingId)}><FormLabel>Country name</FormLabel><Input value={form.countryName} onChange={(e) => setForm((v) => ({ ...v, countryName: e.target.value }))} /></FormControl>
          <FormControl isDisabled={Boolean(editingId)}><FormLabel>Region</FormLabel><Select value={form.region} onChange={(e) => setForm((v) => ({ ...v, region: e.target.value }))}>{['Europe','North America','Oceania','Middle East','Asia','Other'].map((v) => <option key={v}>{v}</option>)}</Select></FormControl>
          <FormControl isDisabled={Boolean(editingId)}><FormLabel>Courier</FormLabel><Input value={form.courierName} onChange={(e) => setForm((v) => ({ ...v, courierName: e.target.value }))} /></FormControl>
          <FormControl><FormLabel>Postal format label</FormLabel><Input value={form.postalFormat} placeholder="e.g. 5 digits" onChange={(e) => setForm((v) => ({ ...v, postalFormat: e.target.value }))} /></FormControl>
          <FormControl><FormLabel>Example</FormLabel><Input value={form.postalExample} placeholder="e.g. 10001" onChange={(e) => setForm((v) => ({ ...v, postalExample: e.target.value }))} /></FormControl>
          <FormControl gridColumn={{ md: '1 / -1' }}><FormLabel>Postal validation pattern</FormLabel><Input fontFamily="mono" value={form.postalPattern} placeholder="^\\d{5}$" onChange={(e) => setForm((v) => ({ ...v, postalPattern: e.target.value }))} /><Text fontSize="xs" color="gray.500" mt={1}>Regular expression used to validate destination ZIP/postal codes.</Text></FormControl>
          <FormControl display="flex" alignItems="center"><FormLabel mb="0">Active</FormLabel><Switch colorScheme="purple" isChecked={form.isActive} onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.checked }))} /></FormControl>
        </Grid>
      </ModalBody><ModalFooter gap={3}><Button variant="ghost" onClick={modal.onClose}>Cancel</Button><Button colorScheme="purple" onClick={() => saveMutation.mutate(form)} isLoading={saveMutation.isPending}>Save rule</Button></ModalFooter></ModalContent></Modal>
    </Box>
  )
}

export default InternationalServiceability
