import { DashboardPage } from './ui/dashboard/DashboardPage';
import { StagePage } from './ui/stage/StagePage';

// Same URLs as Di Chua Online: ?view=stage (or the older ?obs=true) is the live page with sound for LIVE Studio.
// ?view=preview is that page without sound, for checking looks.
const params = new URLSearchParams(window.location.search);
const view = params.get('view');
const isStage = view === 'stage' || params.get('obs') === 'true';

export default function App() {
  if (isStage) return <StagePage withSound />;
  if (view === 'preview') return <StagePage withSound={false} />;
  return <DashboardPage />;
}
