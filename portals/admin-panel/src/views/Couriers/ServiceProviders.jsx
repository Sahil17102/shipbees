import {
  Flex,
  HStack,
  Spinner,
  Switch,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  useToast,
} from '@chakra-ui/react'
import { useServiceProviders, useUpdateServiceProviderStatus } from 'hooks/useCouriers'

const ServiceProviders = () => {
  const { data: providers = [], isLoading, error } = useServiceProviders()
  const updateStatus = useUpdateServiceProviderStatus()
  const toast = useToast()

  if (isLoading) return <Spinner size="md" />
  if (error) return <Text color="red.500">Failed to load service providers</Text>

  const handleToggle = (provider) => {
    updateStatus.mutate(
      { serviceProvider: provider.serviceProvider, isEnabled: !provider.isEnabled },
      {
        onSuccess: () => {
          toast({
            title: `Provider ${provider.isEnabled ? 'disabled' : 'enabled'} successfully`,
            status: 'success',
          })
        },
        onError: () => {
          toast({
            title: 'Failed to update provider status',
            status: 'error',
          })
        },
      },
    )
  }

  return (
    <Flex direction="column" pt={{ base: '120px', md: '75px' }} gap={4}>
      <Text fontSize="xl" fontWeight="bold">
        Service Providers
      </Text>
      <Text fontSize="sm" color="gray.500">
        Manage courier providers and verify whether their API credentials are connected.
      </Text>
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>Provider</Th>
            <Th isNumeric>Total Couriers</Th>
            <Th isNumeric>Enabled Couriers</Th>
            <Th>Status</Th>
            <Th>Credentials</Th>
            <Th textAlign="right">Toggle</Th>
          </Tr>
        </Thead>
        <Tbody>
          {providers.length === 0 ? (
            <Tr>
              <Td colSpan={6} textAlign="center">
                <Text color="gray.500">No service provider data found.</Text>
              </Td>
            </Tr>
          ) : (
            providers.map((p) => (
              <Tr key={p.serviceProvider}>
                <Td textTransform="capitalize">{p.serviceProvider}</Td>
                <Td isNumeric>{p.totalCouriers}</Td>
                <Td isNumeric>{p.enabledCouriers}</Td>
                <Td>
                  <Text fontWeight="semibold" color={p.isEnabled ? 'green.500' : 'red.500'}>
                    {p.isEnabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </Td>
                <Td>
                  {p.connected === null ? (
                    <Text color="gray.500" fontWeight="semibold">Standard integration</Text>
                  ) : (
                    <Text fontWeight="semibold" color={p.connected ? 'green.500' : p.credentialsConfigured ? 'orange.500' : 'red.500'}>
                      {p.connected ? 'Connected' : p.credentialsConfigured ? 'Test required' : 'Setup required'}
                    </Text>
                  )}
                </Td>
                <Td>
                  <HStack justify="flex-end">
                    <Switch
                      colorScheme="green"
                      isChecked={p.isEnabled}
                      isDisabled={updateStatus.isPending}
                      onChange={() => handleToggle(p)}
                    />
                  </HStack>
                </Td>
              </Tr>
            ))
          )}
        </Tbody>
      </Table>
    </Flex>
  )
}

export default ServiceProviders
