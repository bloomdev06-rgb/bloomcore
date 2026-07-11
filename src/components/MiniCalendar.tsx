import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Event } from '../types';

const BRANCH_LABEL: Record<string, string> = { church: 'Bloom Church', light: 'Bloom Light', global: '2 branches' };

export default function MiniCalendar({ events = [] }: { events?: Event[] }) {
  // Événements réels mappés à la forme du calendrier (plus de données factices).
  const EVENTS = events.map((e) => ({
    date: e.date,
    title: e.title,
    location: BRANCH_LABEL[e.branch] ?? e.branch,
    type: e.type,
    closed: e.closed,
  }));
  const [currentDate, setCurrentDate] = useState(new Date()); // mois courant
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
  const monthName = currentDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  const days = [];
  // Adjust for Monday start instead of Sunday
  const emptyDays = firstDay === 0 ? 6 : firstDay - 1;
  
  for (let i = 0; i < emptyDays; i++) {
    days.push(<div key={`empty-${i}`} className="w-8 h-8"></div>);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const event = EVENTS.find(e => e.date === dateStr);
    
    days.push(
      <button
        key={d}
        onClick={() => event && setSelectedEvent(event)}
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors active-scale ease-out-spring ${
          event 
            ? 'bg-bc-green text-white shadow-md hover:scale-110' 
            : 'text-bc-text-secondary hover:bg-bc-canvas'
        }`}
      >
        {d}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] border border-bc-border shadow-sm p-5 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-ui font-bold text-bc-text tracking-tight capitalize">{monthName}</h3>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-full hover:bg-bc-canvas text-bc-text-secondary transition-colors active-scale">
            <ChevronLeft size={16} />
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded-full hover:bg-bc-canvas text-bc-text-secondary transition-colors active-scale">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map(day => (
          <div key={day} className="w-8 h-8 flex items-center justify-center text-[10px] font-bold text-bc-text-secondary">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days}
      </div>

      <AnimatePresence>
        {selectedEvent && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 p-4 bg-bc-canvas rounded-2xl border border-bc-border relative"
          >
            <button 
              onClick={() => setSelectedEvent(null)}
              className="absolute top-2 right-2 p-1 rounded-full text-bc-text-secondary hover:text-bc-text hover:bg-bc-canvas transition-colors active-scale"
            >
              <X size={14} />
            </button>
            <div className="pr-6">
              <span className="text-[10px] font-bold uppercase text-bc-green mb-1 block">
                {new Date(selectedEvent.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <h4 className="font-bold text-bc-text text-sm mb-1">{selectedEvent.title}</h4>
              <p className="text-xs text-bc-text-secondary">{selectedEvent.location}{selectedEvent.closed ? ' • Clôturé' : ''}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
