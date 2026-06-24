import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import type { DistrictLitigation } from '@/lib/dashboardQueries';

/**
 * Interactive Tamil Nadu litigation heat map.
 *
 * Rendered as a responsive, data-driven grid of district tiles whose colour
 * intensity reflects total case count (dark red = highest litigation, orange =
 * medium, green = lowest). Each tile is clickable and drives the district
 * drill-down. This is fully interactive and contains no static images.
 */
function heatColor(value: number, max: number): { bg: string; fg: string } {
  if (max <= 0 || value <= 0) return { bg: '#dcfce7', fg: '#166534' };       // green-100
  const r = value / max;
  if (r >= 0.75) return { bg: '#b91c1c', fg: '#ffffff' };                     // dark red
  if (r >= 0.5)  return { bg: '#ef4444', fg: '#ffffff' };                     // red
  if (r >= 0.3)  return { bg: '#f97316', fg: '#ffffff' };                     // orange
  if (r >= 0.15) return { bg: '#fbbf24', fg: '#7c2d12' };                     // amber
  return { bg: '#86efac', fg: '#166534' };                                    // green
}

export function TNLitigationHeatMap({
  districts, selected, onSelect, loading,
}: {
  districts: DistrictLitigation[];
  selected: string | null;
  onSelect: (district: string) => void;
  loading: boolean;
}) {
  const max = useMemo(() => districts.reduce((m, d) => Math.max(m, d.total), 0), [districts]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-red-600" /> Tamil Nadu Litigation Heat Map
        </CardTitle>
        <p className="text-xs text-muted-foreground">Colour intensity reflects total case load. Click a district to drill down.</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />)}
          </div>
        ) : districts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No district data available.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {districts.map(d => {
                const { bg, fg } = heatColor(d.total, max);
                const isSel = selected === d.district;
                return (
                  <button
                    key={d.district}
                    type="button"
                    onClick={() => onSelect(d.district)}
                    title={`${d.district}: ${d.total} cases (${d.pending} pending, ${d.disposed} disposed)`}
                    style={{ backgroundColor: bg, color: fg }}
                    className={`flex flex-col items-start justify-between rounded-md px-3 py-2 text-left transition-transform hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${isSel ? 'ring-2 ring-offset-1 ring-blue-600' : ''}`}
                  >
                    <span className="line-clamp-1 text-xs font-semibold" title={d.district}>{d.district}</span>
                    <span className="mt-1 text-lg font-bold leading-none">{d.total}</span>
                    <span className="mt-0.5 text-[10px] opacity-90">{d.pending}P · {d.disposed}D</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="font-medium">Litigation:</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: '#b91c1c' }} /> Highest</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: '#f97316' }} /> Medium</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: '#86efac' }} /> Lowest</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
