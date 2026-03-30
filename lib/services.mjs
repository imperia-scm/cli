import { getRuntimeContext } from './runtime-config.mjs';

export function getServiceDefinitions() {
  return getRuntimeContext().services;
}

export function getServiceDefinition(commandName) {
  const service = getRuntimeContext().servicesByCommandName.get(commandName);

  if (!service) {
    throw new Error(`Unknown service command: ${commandName}`);
  }

  return service;
}

export function getServicesByCommandNames(commandNames) {
  return commandNames.map((commandName) => getServiceDefinition(commandName));
}

function normalizeServices(servicesOrCommandNames = getServiceDefinitions()) {
  return servicesOrCommandNames.map((entry) =>
    typeof entry === 'string' ? getServiceDefinition(entry) : entry,
  );
}

export function getSelectedRepoKeys(servicesOrCommandNames) {
  const services = normalizeServices(servicesOrCommandNames);

  return [...new Set(services.map((service) => service.repoKey))];
}

export function getManagedPorts(servicesOrCommandNames = getServiceDefinitions()) {
  const services = normalizeServices(servicesOrCommandNames);
  return [...new Set(services.flatMap((service) => service.ports ?? []))];
}
