import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pac Ben',
    short_name: 'Pac Ben',
    description: 'Shoot the robots, clear the maze.',
    start_url: '/',
    display: 'fullscreen',
    orientation: 'portrait',
    background_color: '#03050d',
    theme_color: '#03050d',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
