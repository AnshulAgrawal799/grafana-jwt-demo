import type { Metadata } from 'next';

import { AuthServerData } from '@/components/AuthServerData';
import './styles.css';

export const metadata: Metadata = {
  title: 'Grafana JWT Demo',
  description: 'Next.js WebView broker demo for Grafana JWT iframe embedding.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthServerData>{children}</AuthServerData>
      </body>
    </html>
  );
}