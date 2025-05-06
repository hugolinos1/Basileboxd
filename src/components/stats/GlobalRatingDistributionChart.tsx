// src/components/stats/GlobalRatingDistributionChart.tsx
'use client';

import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import type { PartyData } from '@/lib/party-utils';
import { Star } from 'lucide-react';

interface GlobalRatingDistributionChartProps {
  allParties: PartyData[];
}

const chartConfig = {
  votes: { label: "Votes", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

export function GlobalRatingDistributionChart({ allParties }: GlobalRatingDistributionChartProps) {
  const ratingCounts = useMemo(() => {
    const counts: { rating: number; votes: number }[] = Array.from({ length: 10 }, (_, i) => ({
      rating: (i + 1) * 0.5,
      votes: 0,
    }));

    allParties.forEach(party => {
      if (party.ratings) {
        Object.values(party.ratings).forEach(rating => {
          const index = Math.round(rating * 2) - 1;
          if (index >= 0 && index < 10) {
            counts[index].votes++;
          }
        });
      }
    });
    return counts;
  }, [allParties]);

  const totalVotes = useMemo(() => {
    return ratingCounts.reduce((sum, item) => sum + item.votes, 0);
  }, [ratingCounts]);

  if (totalVotes === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Pas encore de notes sur l'ensemble des événements.</p>;
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-2 px-1">
        <p className="text-sm font-medium text-muted-foreground">Répartition des notes</p>
        <p className="text-sm font-medium text-muted-foreground">{totalVotes} vote{totalVotes > 1 ? 's' : ''} au total</p>
      </div>
      <ChartContainer config={chartConfig} className="flex-1 min-h-0 w-full"> {/* Ensure chart container takes available space */}
        <BarChart
          accessibilityLayer
          data={ratingCounts}
          margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
          barCategoryGap="10%"
        >
          <XAxis
            dataKey="rating"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => value % 1 === 0 ? `${value}.0` : `${value}`}
            fontSize={10}
            interval={1} // Show every other tick if too crowded, or adjust based on number of bars
          />
          <YAxis hide={false} tickLine={false} axisLine={false} tickMargin={8} fontSize={10} />
          <RechartsTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel hideIndicator />}
            formatter={(value, name, props) => [`${value} votes`, `${props.payload.rating} étoiles`]}
          />
          <Bar dataKey="votes" fill="var(--color-votes)" radius={4} />
        </BarChart>
      </ChartContainer>
      <div className="flex justify-between items-center mt-1 px-1 text-xs text-muted-foreground">
        <span>0.5 <Star className="inline h-3 w-3 text-yellow-400 fill-current" /></span>
        <span>5.0 <Star className="inline h-3 w-3 text-yellow-400 fill-current" /></span>
      </div>
    </div>
  );
}
