import { useState } from 'react';
import { Branch, Member, Report } from '../types';
import { TrendingUp } from 'lucide-react';
import { PeriodSelector } from './ui/PeriodSelector';
import { TrendsPanel } from './ui/TrendsPanel';
import { useDepartments, useMinistries } from '../data';
import { dashboardScope } from '../data/scope';
import { Period, PeriodInput } from '../data/kpi';

interface TrendsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  members?: Member[];
  reports?: Report[];
  operatorId?: string;
}

export default function TrendsView({ activeBranch, simulatedRole, members = [], reports = [], operatorId }: TrendsViewProps) {
  const [period, setPeriod] = useState<Period>('quarter'); // défaut trimestre : une tendance a besoin de recul
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const effectivePeriod: PeriodInput = period === 'custom' && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59`) }
    : period;

  const departments = useDepartments();
  const ministries = useMinistries();
  const operator = members.find(m => m.id === operatorId);

  // Même portée que l'accueil (§13.3) : global pour le staff pastoral, département/ministère sinon.
  const scope = dashboardScope(operator, simulatedRole, members, reports, departments, ministries);
  const branchMembers = scope.members.filter(m => activeBranch === 'global' || m.branch === activeBranch);
  const branchReports = scope.reports.filter(r => activeBranch === 'global' || r.targetBranch === activeBranch);

  return (
    <div className="space-y-6 pb-6">
      {/* Bandeau + sélecteur de période */}
      <div className="bg-bc-green rounded-[2rem] p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-ui font-extrabold tracking-tight flex items-center gap-2"><TrendingUp size={22} /> Tendances · {scope.label}</h2>
          <p className="text-white/80 text-sm mt-1">Évolution hebdomadaire des indicateurs clés.</p>
        </div>
        <PeriodSelector
          variant="dark"
          period={period}
          onPeriodChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      </div>
      <TrendsPanel members={branchMembers} reports={branchReports} effectivePeriod={effectivePeriod} />
    </div>
  );
}
