import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  SimpleGrid,
  Text,
  useToast,
  VStack,
} from '@chakra-ui/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconPlaneDeparture, IconPlugConnected, IconRoute } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import {
  testDilliKingCredentials,
  trackDilliKingShipment,
  updateDilliKingCredentials,
} from '../../services/courier.service'

const DilliKingCredentialsPanel = ({ credentials }) => {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ apiBase: 'https://api.dilliking.com', email: '', password: '' })
  const [airwayBill, setAirwayBill] = useState('')
  const [tracking, setTracking] = useState(null)

  useEffect(() => {
    setForm((current) => ({
      ...current,
      apiBase: credentials?.apiBase || 'https://api.dilliking.com',
      email: credentials?.email || '',
      password: '',
    }))
  }, [credentials])

  const saveMutation = useMutation({
    mutationFn: updateDilliKingCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courierCredentials'] })
      setForm((current) => ({ ...current, password: '' }))
      toast({ title: 'DilliKing credentials saved securely', status: 'success' })
    },
    onError: (error) => toast({ title: 'Could not save DilliKing credentials', description: error.message, status: 'error' }),
  })
  const testMutation = useMutation({
    mutationFn: testDilliKingCredentials,
    onSuccess: () => toast({ title: 'DilliKing authentication successful', status: 'success' }),
    onError: (error) => toast({ title: 'DilliKing authentication failed', description: error.message, status: 'error' }),
  })
  const trackingMutation = useMutation({
    mutationFn: trackDilliKingShipment,
    onSuccess: (data) => setTracking(data),
    onError: (error) => toast({ title: 'Tracking lookup failed', description: error.message, status: 'error' }),
  })

  return (
    <Box borderWidth="1px" borderColor="purple.200" bg="purple.50" borderRadius="xl" p={{ base: 4, md: 6 }}>
      <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} gap={3} mb={5} direction={{ base: 'column', md: 'row' }}>
        <Flex align="center" gap={3}>
          <Flex w="40px" h="40px" borderRadius="lg" bg="purple.600" color="white" align="center" justify="center"><IconPlaneDeparture size={22} /></Flex>
          <Box><Text fontWeight="800">DilliKing International API</Text><Text fontSize="sm" color="gray.600">Token login · AWB generation · live tracking</Text></Box>
        </Flex>
        <Badge colorScheme={credentials?.configured ? 'green' : 'orange'} px={3} py={1} borderRadius="full">
          {credentials?.configured ? 'Configured' : 'Setup required'}
        </Badge>
      </Flex>

      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={4}>
        <FormControl><FormLabel>API Base URL</FormLabel><Input bg="white" value={form.apiBase} onChange={(e) => setForm((v) => ({ ...v, apiBase: e.target.value }))} /></FormControl>
        <FormControl><FormLabel>Login email</FormLabel><Input bg="white" type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} /></FormControl>
        <FormControl><FormLabel>Password</FormLabel><Input bg="white" type="password" value={form.password} placeholder={credentials?.hasPassword ? 'Leave blank to keep saved password' : 'Enter API password'} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} /></FormControl>
      </SimpleGrid>

      <Flex gap={3} mt={4} wrap="wrap">
        <Button colorScheme="purple" onClick={() => saveMutation.mutate(form)} isLoading={saveMutation.isPending}>Save credentials</Button>
        <Button leftIcon={<IconPlugConnected size={17} />} variant="outline" colorScheme="purple" onClick={() => testMutation.mutate()} isLoading={testMutation.isPending} isDisabled={!credentials?.configured}>Test connection</Button>
      </Flex>

      <Box bg="white" borderRadius="lg" p={4} mt={5} borderWidth="1px" borderColor="purple.100">
        <Text fontWeight="700" mb={3}>Tracking test</Text>
        <Flex gap={3} direction={{ base: 'column', md: 'row' }}>
          <Input value={airwayBill} onChange={(e) => setAirwayBill(e.target.value)} placeholder="Enter DilliKing AWB" />
          <Button leftIcon={<IconRoute size={17} />} colorScheme="blue" minW="150px" onClick={() => trackingMutation.mutate(airwayBill)} isLoading={trackingMutation.isPending} isDisabled={!airwayBill.trim()}>Track AWB</Button>
        </Flex>
        {tracking && <VStack align="stretch" spacing={1} mt={4} p={3} bg="gray.50" borderRadius="md"><Text fontSize="xs" fontWeight="700" color="gray.500">LATEST API RESPONSE</Text><Text fontSize="sm" whiteSpace="pre-wrap">{JSON.stringify(tracking, null, 2)}</Text></VStack>}
      </Box>
      <Text mt={3} fontSize="xs" color="gray.600">Credentials are encrypted at rest. Access tokens stay on the backend and are never exposed to the browser.</Text>
    </Box>
  )
}

export default DilliKingCredentialsPanel
