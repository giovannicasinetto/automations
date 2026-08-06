// Server component: fetches live data from Supabase (service key stays on the
// server) and hands it to the client Dashboard. Revalidates hourly so the page
// stays fresh without a rebuild.
import Dashboard from '../components/Dashboard';
import { getDashboardData } from '../lib/data';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

export default async function Page() {
  let data, error;
  try {
    data = await getDashboardData();
  } catch (e) {
    error = e.message;
  }

  if (error) {
    return (
      <div className="wrap">
        <div className="panel"><div className="empty">
          <h3>Couldn&apos;t load data</h3>
          <p>{error}. Check the Supabase env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) on this deployment.</p>
        </div></div>
      </div>
    );
  }
  return <Dashboard data={data} />;
}
