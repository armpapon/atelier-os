import { FinanceView } from './Finance.jsx';
// `tab` / `onTabChange` are forwarded so the sidebar accordion and the page
// share one sub-tab. Without them FinanceView keeps its own state (v4.38).
export function FamilyFinance(props) { return <FinanceView scope="family" {...props} />; }
