import { useId } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { cssColor, type Swatch } from '../../../utils/insights'

/** A small trend with no axes: a 2px line over a fading wash of its own color. */
export function Sparkline({
  values,
  swatch,
  height = 40,
}: {
  values: readonly number[]
  swatch: Swatch
  height?: number
}) {
  // useId's colons would break the url(#…) reference.
  const id = `spark${useId().replace(/[^\w-]/g, '')}`
  const color = cssColor(swatch)
  return (
    <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 160, height }}>
      <AreaChart data={values.map((value) => ({ value }))} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
