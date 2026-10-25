import {
  Badge, Box, Button, Flex, FormControl, FormLabel, Input, SimpleGrid, Text, useToast,
} from '@chakra-ui/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconPlaneDeparture, IconPlugConnected } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { testIclCredentials, updateIclCredentials } from '../../services/courier.service'

const API_BASE = 'https://cloud.iclinternational.in'

const IclCredentialsPanel = ({ credentials }) => {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ apiBase: API_BASE, userId: '', customerCode: '', password: '' })

  useEffect(() => {
    setForm((current) => ({
      ...current,
      apiBase: API_BASE,
      userId: credentials?.userId || '',
      customerCode: credentials?.customerCode || '',
      password: '',
    }))
  }, [credentials])

  const saveMutation = useMutation({
    mutationFn: updateIclCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courierCredentials'] })
      setForm((current) => ({ ...current, password: '' }))
      toast({ title: 'ICL credentials saved securely', status: 'success' })
    },
    onError: (error) => toast({ title: 'Could not save ICL credentials', description: error.message, status: 'error' }),
  })
  const testMutation = useMutation({
    mutationFn: testIclCredentials,
    onSuccess: () => toast({ title: 'ICL production credentials accepted', description: 'No shipment was created.', status: 'success' }),
    onError: (error) => toast({ title: 'ICL credential check failed', description: error.message, status: 'error' }),
  })

  return (
    <Box borderWidth="1px" borderColor="blue.200" bg="blue.50" borderRadius="xl" p={{ base: 4, md: 6 }}>
      <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} gap={3} mb={5} direction={{ base: 'column', md: 'row' }}>
        <Flex align="center" gap={3}>
          <Flex w="40px" h="40px" borderRadius="lg" bg="blue.700" color="white" align="center" justify="center"><IconPlaneDeparture size={22} /></Flex>
          <Box><Text fontWeight="800">ICL International Production API</Text><Text fontSize="sm" color="gray.600">Separate ICL account · direct JSON AWB booking</Text></Box>
        </Flex>
        <Badge colorScheme={credentials?.configured ? 'green' : 'orange'} px={3} py={1} borderRadius="full">{credentials?.configured ? 'Configured' : 'Setup required'}</Badge>
      </Flex>
      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
        <FormControl><FormLabel>API Base URL</FormLabel><Input bg="gray.100" value={form.apiBase} isReadOnly /></FormControl>
        <FormControl><FormLabel>User ID</FormLabel><Input bg="white" value={form.userId} onChange={(e) => setForm((v) => ({ ...v, userId: e.target.value }))} /></FormControl>
        <FormControl><FormLabel>Customer code</FormLabel><Input bg="white" value={form.customerCode} onChange={(e) => setForm((v) => ({ ...v, customerCode: e.target.value }))} /></FormControl>
        <FormControl><FormLabel>Password</FormLabel><Input bg="white" type="password" value={form.password} placeholder={credentials?.hasPassword ? 'Leave blank to keep saved password' : 'Enter ICL API password'} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} /></FormControl>
      </SimpleGrid>
      <Flex gap={3} mt={4} wrap="wrap">
        <Button colorScheme="blue" onClick={() => saveMutation.mutate(form)} isLoading={saveMutation.isPending}>Save ICL credentials</Button>
        <Button leftIcon={<IconPlugConnected size={17} />} variant="outline" colorScheme="blue" onClick={() => testMutation.mutate()} isLoading={testMutation.isPending} isDisabled={!credentials?.configured}>Test ICL connection safely</Button>
      </Flex>
      <Text mt={4} fontSize="xs" color="gray.600">This is independent from DilliKing. The safe test cannot create an AWB; the supplied ICL document contains no tracking endpoint.</Text>
    </Box>
  )
}

export default IclCredentialsPanel
