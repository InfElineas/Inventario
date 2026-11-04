import PantallaError from '@/components/shared/PantallaError';

export default function AccessDenied() {
  return <PantallaError tipo="sinAcceso" />;
}
