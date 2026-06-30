import React, { createContext, useContext } from 'react';
import { ResponsiveContainer } from 'recharts';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const ChartContext = createContext({ isMobile: false });

export function useChartResponsive() {
  return useContext(ChartContext);
}

interface ResponsiveChartProps {
  children: React.ReactNode;
  height?: number | string;
  minHeight?: number;
}

export function ResponsiveChart({ children, height = '100%', minHeight = 200 }: ResponsiveChartProps) {
  const isMobile = useMediaQuery('(max-width: 639px)');

  return (
    <ChartContext.Provider value={{ isMobile }}>
      <div style={{ width: '100%', height, minHeight }} className="min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}
