import { PacBenGame } from '@/components/pac-ben.tsx';
import { orbitron } from './fonts.ts';

export default function Page() {
  return <PacBenGame font={`${orbitron.style.fontFamily}, "Segoe UI", system-ui, sans-serif`} />;
}
