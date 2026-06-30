import React from 'react';
import { Branch } from '../types';
import { UserCog, ShieldAlert } from 'lucide-react';

interface AccountsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
}

export default function AccountsView({ activeBranch, simulatedRole }: AccountsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-ui font-extrabold text-bc-text flex items-center gap-2">
            <UserCog size={28} className={'text-bc-text'} />
            Comptes & Admins
          </h2>
          <p className="text-xs text-bc-text-secondary mt-0.5">
            Gestion des comptes privilégiés et des Super Admins.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-ui font-bold text-bc-text">Comptes Admins</h3>
            <span className="text-[10px] bg-slate-100 text-bc-text px-2 py-0.5 rounded-full font-bold">4 Actifs</span>
          </div>
          <p className="text-xs text-bc-text-secondary mb-4">Éligibles par défaut : Pasteurs et Ministres.</p>
          
          <div className="space-y-2">
            <div className="p-3 border border-bc-border rounded-xl flex justify-between items-center bg-bc-canvas">
              <div>
                <p className="text-sm font-bold text-bc-text">Ps. Kacou</p>
                <p className="text-[10px] text-bc-text-secondary">Pasteur</p>
              </div>
              {simulatedRole === 'Super Admin' && (
                <button className="text-xs text-red-500 font-bold hover:underline">Révoquer</button>
              )}
            </div>
            <div className="p-3 border border-bc-border rounded-xl flex justify-between items-center bg-bc-canvas">
              <div>
                <p className="text-sm font-bold text-bc-text">Yannick G.</p>
                <p className="text-[10px] text-bc-text-secondary">Ministre</p>
              </div>
              {simulatedRole === 'Super Admin' && (
                <button className="text-xs text-red-500 font-bold hover:underline">Révoquer</button>
              )}
            </div>
          </div>
          
          {simulatedRole === 'Super Admin' && (
            <button className="w-full mt-4 py-2 border-2 border-dashed border-bc-border text-bc-text-secondary font-bold text-xs rounded-xl hover:bg-bc-canvas transition-colors">
              + Nommer un Admin
            </button>
          )}
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-bc-border shadow-sm border-l-4 border-l-red-500">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={20} className="text-red-500" />
            <h3 className="font-ui font-bold text-bc-text">Super Admins</h3>
          </div>
          <p className="text-xs text-bc-text-secondary mb-4">Accès illimité à l'ensemble du système et attribution des droits Admin.</p>
          
          <div className="space-y-2">
            <div className="p-3 border border-bc-border rounded-xl flex justify-between items-center bg-bc-canvas">
              <div>
                <p className="text-sm font-bold text-bc-text">Affeny Grah</p>
                <p className="text-[10px] text-bc-text-secondary">Super Admin (Système)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
