import { api } from './api';

export type ConsultaDni = {
  tipo: 'DNI';
  numero: string;
  nombreCompleto: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  // RUC de persona natural que le correspondería a este DNI.
  rucSugerido: string;
};

export type ConsultaRuc = {
  tipo: 'RUC';
  numero: string;
  razonSocial: string;
  direccion: string;
  estado: string;
  condicion: string;
};

export function consultarDni(numero: string) {
  return api<ConsultaDni>(`/consulta-documento/dni/${numero}`);
}

export function consultarRuc(numero: string) {
  return api<ConsultaRuc>(`/consulta-documento/ruc/${numero}`);
}
