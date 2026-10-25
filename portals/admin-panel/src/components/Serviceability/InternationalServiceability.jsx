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
  Select,
  Spinner,
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
import { IconEdit, IconMapPinCheck, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
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

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['international-serviceability'],
    queryFn: internationalServiceabilityService.list,
  })
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
        <Box><Heading size="md">International postal coverage</Heading><Text color="gray.600" fontSize="sm">Country-wide postal patterns cover valid ZIP/postcodes without storing millions of individual rows.</Text></Box>
        <Button leftIcon={<IconPlus size={17} />} colorScheme="purple" onClick={openAdd}>Add postal rule</Button>
      </Flex>

      <Box bg="blue.50" borderWidth="1px" borderColor="blue.100" borderRadius="lg" p={4} mb={5}>
        <Flex gap={3} align={{ base: 'stretch', md: 'flex-end' }} direction={{ base: 'column', md: 'row' }}>
          <FormControl><FormLabel fontSize="sm">Country</FormLabel><Select bg="white" value={check.countryCode} onChange={(e) => setCheck((v) => ({ ...v, countryCode: e.target.value }))}>{[...new Map(rules.map((r) => [r.countryCode, r])).values()].map((r) => <option key={r.countryCode} value={r.countryCode}>{r.countryName}</option>)}</Select></FormControl>
          <FormControl><FormLabel fontSize="sm">Postal / ZIP code</FormLabel><Input bg="white" value={check.postalCode} onChange={(e) => setCheck((v) => ({ ...v, postalCode: e.target.value }))} placeholder="e.g. SW1A 1AA" /></FormControl>
          <Button minW="155px" leftIcon={<IconMapPinCheck size={17} />} colorScheme="blue" onClick={() => checkMutation.mutate(check)} isLoading={checkMutation.isPending}>Check coverage</Button>
        </Flex>
        {checkResult && <Badge mt={3} px={3} py={1} colorScheme={checkResult.serviceable ? 'green' : 'red'}>{checkResult.serviceable ? `Serviceable by ${checkResult.matches.map((m) => m.courierName).join(', ')}` : 'Not serviceable'}</Badge>}
      </Box>

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
