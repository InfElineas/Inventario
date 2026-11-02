import { Check } from 'lucide-react';

export default function Timeline({ steps, currentStep }) {
  return (
    <div className="flex items-center gap-0 w-full py-4">
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const isPending = i > currentStep;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all
                ${isCompleted ? 'bg-[var(--c-ok-dim)] text-white' : ''}
                ${isCurrent ? 'bg-[var(--c-info)] text-white ring-2 ring-[var(--c-info)]/30' : ''}
                ${isPending ? 'bg-muted text-muted-foreground' : ''}
              `}>
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-[11px] mt-1.5 whitespace-nowrap font-medium
                ${isCompleted ? 'text-[var(--c-ok-dim)]' : ''}
                ${isCurrent ? 'text-[var(--c-info)]' : ''}
                ${isPending ? 'text-muted-foreground' : ''}
              `}>{step}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-[1px] flex-1 mx-2 mt-[-18px]
                ${isCompleted ? 'bg-[var(--c-ok-dim)]' : 'bg-border'}
              `} />
            )}
          </div>
        );
      })}
    </div>
  );
}