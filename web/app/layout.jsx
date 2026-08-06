import './globals.css';

export const metadata = {
  title: 'Casinetto · Price Radar',
  description: 'Casinetto competitor price competitiveness vs UAE grocers.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
