import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LabelList,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomeCharts({ chartData, statusChartData, projectChartData }) {
  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Report by Type</CardTitle>
            <CardDescription>Online vs Offline</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={chartData}
                margin={{
                  left: -20,
                  right: 20,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis dataKey="type" tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="online" fill="#3b82f6" radius={8} />
                <Bar dataKey="offline" fill="#f87171" radius={8} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
              
        <Card className="flex flex-col">
            <CardHeader className="items-center pb-0">
                <CardTitle>Reports by Status</CardTitle>
                <CardDescription>Distribution across current report states</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-0">
               <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                    <Pie
                    data={statusChartData}
                    dataKey="value"
                    labelLine={false}
                    label={({ payload, ...props }) => {
                        return (
                        <text
                            cx={props.cx}
                            cy={props.cy}
                            x={props.x}
                            y={props.y}
                            textAnchor={props.textAnchor}
                            dominantBaseline={props.dominantBaseline}
                            fill="var(--foreground)"
                        >
                            {payload.value}
                        </text>
                        )
                    }}
                    nameKey="name">
                        <Cell fill="#3b82f6" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#6366f1" />
                        <Cell fill="#22c55e" />
                        <Cell fill="#6b7280" />
                    </Pie>
                </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
              
        <Card>
            <CardHeader>
                <CardTitle>Reports by Project</CardTitle>
                <CardDescription>Volume grouped by project assignment</CardDescription>
            </CardHeader>
            <CardContent>
            <ResponsiveContainer width="100%" height={250}>
                <BarChart
                    data={projectChartData}
                    layout="vertical"
                margin={{ top: 5, right: 44, left: 20, bottom: 5 }}
                style={{ "--color-label": "var(--foreground)" }}
                >
                    <CartesianGrid horizontal={false} />
                    <YAxis
                  dataKey="project"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  hide
                    />
                <XAxis type="number" hide />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#3b82f6" radius={4}>
                  <LabelList
                    dataKey="project"
                    position="insideLeft"
                    offset={8}
                    className="fill-[var(--color-background)]"
                    fontSize={12}
                  />
                  <LabelList
                    dataKey="count"
                    position="right"
                    offset={8}
                    className="fill-[var(--color-foreground)]"
                    fontSize={12}
                  />
                </Bar>
                </BarChart>
                </ResponsiveContainer>
            </CardContent>
            </Card>
      </div>

    </>
  );
}