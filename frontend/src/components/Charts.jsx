import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { inr, pct } from '../lib/format.js'

const BRAND = '#0e7a5f'
const ACCENT = '#f59e0b'
const GRID = '#eee7db'

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #e7e1d6',
  borderRadius: 10,
  fontSize: 13,
  boxShadow: '0 2px 8px rgb(28 25 23 / 0.08)',
}

/** Revenue bars + estimated profit line for the last N days. */
export function TrendChart({ data, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b675f' }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b675f' }}
          tickLine={false}
          axisLine={false}
          width={54}
        />
        <Tooltip
          cursor={{ fill: 'rgb(14 122 95 / 0.06)' }}
          contentStyle={tooltipStyle}
          formatter={(value, name) =>
            name === 'sales'
              ? [`${value} sale(s)`, 'Sales']
              : [inr(value, { decimals: 2 }), name === 'revenue' ? 'Revenue' : 'Est. profit']
          }
        />
        <Bar dataKey="revenue" fill={BRAND} radius={[5, 5, 0, 0]} maxBarSize={34} />
        <Line
          dataKey="profit"
          stroke={ACCENT}
          strokeWidth={2.5}
          dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Estimated gross margin by product — colour-coded by status. */
export function MarginBarChart({ rows, height = 260 }) {
  const data = [...rows]
    .sort((a, b) => (a.gross_margin_pct ?? -999) - (b.gross_margin_pct ?? -999))
    .map((r) => ({
      name: r.name,
      margin: r.gross_margin_pct,
      status: r.margin_status,
    }))

  const colour = (status) =>
    status === 'negative' ? '#dc2626' : status === 'weak' ? ACCENT : status === 'unknown' ? '#a8a29e' : BRAND

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#6b675f' }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          domain={['auto', 'auto']}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={128}
          tick={{ fontSize: 11, fill: '#44403c' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgb(14 122 95 / 0.06)' }}
          contentStyle={tooltipStyle}
          formatter={(value, _name, item) => [
            item.payload.margin === null ? 'no data' : pct(item.payload.margin),
            'Est. gross margin',
          ]}
          labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? ''}
        />
        <Bar dataKey="margin" radius={[0, 5, 5, 0]} maxBarSize={18}>
          {data.map((entry, index) => (
            <Cell key={index} fill={colour(entry.status)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
