import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react/esm/core';
import * as echarts from 'echarts/core';
import { MapChart } from 'echarts/charts';
import { TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Minus, Plus, RotateCcw } from 'lucide-react';
import type { DistrictDetail, DistrictLitigation } from '@/lib/dashboardQueries';

echarts.use([MapChart, TooltipComponent, VisualMapComponent, CanvasRenderer]);

const GEO_URL = '/tn-districts.geojson';
const MAP_NAME = 'tamilnadu-boundary';
const DEFAULT_ZOOM = 1.2;
const DEFAULT_CENTER: [number, number] = [78.5, 11.0];

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

const ALIASES: Record<string, string> = {
  trichy: 'tiruchirappalli',
  tiruchirapalli: 'tiruchirappalli',
  tuticorin: 'thoothukkudi',
  thuthukudi: 'thoothukkudi',
  kanniyakumari: 'kanyakumari',
  villupuram: 'viluppuram',
  tirupattur: 'tirupathur',
  tiruppattur: 'tirupathur',
  kanchipuram: 'kancheepuram',
  thenilgiris: 'nilgiris',
  virudunagar: 'virudhunagar',
  nagappattinam: 'nagapattinam',
};

function canon(s: string): string {
  const n = norm(s);
  return ALIASES[n] ?? n;
}

interface MapDistrictDatum {
  name: string;
  value: number;
  pending: number;
  disposed: number;
  upcomingHearings: number;
}

export function TNDistrictMap({
  districts, details, selected, onSelect, loading,
}: {
  districts: DistrictLitigation[];
  details?: Record<string, DistrictDetail>;
  selected: string | null;
  onSelect: (district: string) => void;
  loading: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [geoNames, setGeoNames] = useState<string[]>([]);
  const [view, setView] = useState<{ zoom: number; center: [number, number] }>({ zoom: DEFAULT_ZOOM, center: DEFAULT_CENTER });

  useEffect(() => {
    let active = true;
    fetch(GEO_URL)
      .then(r => r.json())
      .then((geo: { features?: { properties?: Record<string, unknown> }[] }) => {
        if (!active) return;
        echarts.registerMap(MAP_NAME, geo as Parameters<typeof echarts.registerMap>[1]);
        const names = (geo.features ?? [])
          .map(f => (f.properties?.district as string) ?? '')
          .filter(Boolean);
        setGeoNames(names);
        setReady(true);
      })
      .catch(() => { if (active) setReady(false); });
    return () => { active = false; };
  }, []);

  const data = useMemo(() => {
    const byCanon = new Map<string, DistrictLitigation>();
    districts.forEach(d => byCanon.set(canon(d.district), d));
    return geoNames.map(name => {
      const row = byCanon.get(canon(name));
      const detail = row ? details?.[row.district] : undefined;
      return {
        name,
        value: row?.total ?? 0,
        pending: row?.pending ?? 0,
        disposed: row?.disposed ?? 0,
        upcomingHearings: detail?.upcomingHearings ?? 0,
      } satisfies MapDistrictDatum;
    });
  }, [details, districts, geoNames]);

  const selectedName = useMemo(() => {
    if (!selected) return null;
    const key = canon(selected);
    return geoNames.find(n => canon(n) === key) ?? null;
  }, [selected, geoNames]);

  const option = useMemo(() => ({
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: '#0f172a',
      borderColor: '#0f172a',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (p: { data?: MapDistrictDatum; name: string }) => {
        const d = p.data;
        if (!d) return p.name;
        return [
          `<div style="font-weight:700;margin-bottom:4px">${p.name}</div>`,
          `<div>Total Cases: <b>${d.value}</b></div>`,
          `<div>Pending: <b>${d.pending}</b></div>`,
          `<div>Disposed: <b>${d.disposed}</b></div>`,
          `<div>Upcoming Hearings: <b>${d.upcomingHearings}</b></div>`,
          '<div style="margin-top:4px;opacity:.7;font-size:11px">Click to apply district filter</div>',
        ].join('');
      },
    },
    visualMap: {
      type: 'piecewise' as const,
      pieces: [
        { max: 0, label: '0 Cases', color: '#e2e8f0' },
        { min: 1, max: 10, label: '1-10', color: '#c7d2fe' },
        { min: 11, max: 25, label: '11-25', color: '#93c5fd' },
        { min: 26, max: 50, label: '26-50', color: '#60a5fa' },
        { min: 51, label: '51+', color: '#2563eb' },
      ],
      left: 12,
      bottom: 12,
      orient: 'vertical' as const,
      itemWidth: 14,
      itemHeight: 10,
      textStyle: { fontSize: 11 },
    },
    series: [{
      name: 'District Cases',
      type: 'map' as const,
      map: MAP_NAME,
      nameProperty: 'district',
      roam: true,
      zoom: view.zoom,
      center: view.center,
      layoutCenter: ['50%', '50%'],
      layoutSize: '100%',
      selectedMode: 'single' as const,
      scaleLimit: { min: 1, max: 8 },
      label: {
        show: true,
        fontSize: 9,
        color: '#0f172a',
        formatter: (p: { name: string; data?: MapDistrictDatum }) => `${p.name}\n${p.data?.value ?? 0}`,
      },
      itemStyle: {
        borderColor: '#64748b',
        borderWidth: 0.8,
      },
      emphasis: {
        label: { color: '#020617', fontSize: 9 },
        itemStyle: { borderColor: '#1d4ed8', borderWidth: 1.6, shadowBlur: 14, shadowColor: 'rgba(37,99,235,0.45)' },
      },
      select: {
        itemStyle: { borderColor: '#1e3a8a', borderWidth: 2 },
      },
      data: data.map(d => (selectedName && d.name === selectedName ? { ...d, selected: true } : d)),
      animationDurationUpdate: 350,
    }],
  }), [data, selectedName, view.center, view.zoom]);

  const onEvents = useMemo(() => ({
    click: (p: { name?: string }) => {
      if (!p?.name) return;
      const isSame = selectedName === p.name;
      onSelect(isSame ? '' : p.name);
    },
  }), [onSelect, selectedName]);

  const zoomBy = (factor: number) => setView(v => ({ ...v, zoom: Math.min(8, Math.max(1, +(v.zoom * factor).toFixed(2))) }));
  const reset = () => setView({ zoom: DEFAULT_ZOOM, center: DEFAULT_CENTER });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-blue-600" /> Tamil Nadu District Boundary Map
        </CardTitle>
        <p className="text-xs text-muted-foreground">Interactive district boundaries with labels, case counts, tooltip analytics, zoom/pan and click-to-filter.</p>
      </CardHeader>
      <CardContent>
        {loading || !ready ? (
          <div className="h-[500px] w-full animate-pulse rounded-md bg-muted" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-end gap-1">
              <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => zoomBy(1.25)} aria-label="Zoom in"><Plus className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => zoomBy(0.8)} aria-label="Zoom out"><Minus className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={reset} aria-label="Reset map"><RotateCcw className="h-4 w-4" /></Button>
            </div>

            <div className="overflow-hidden rounded-lg border bg-slate-50">
              <ReactECharts
                echarts={echarts}
                option={option}
                onEvents={onEvents}
                notMerge={false}
                lazyUpdate
                style={{ height: 500, width: '100%' }}
              />
            </div>

            <p className="text-xs text-muted-foreground">Tap/click a district to apply filter. Tap the same district again to clear.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
