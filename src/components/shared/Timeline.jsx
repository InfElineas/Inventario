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
                ${isCompleted ? 'bg-[#1D9E75] text-white' : ''}
                ${isCurrent ? 'bg-[#378ADD] text-white ring-2 ring-[#378ADD]/30' : ''}
                ${isPending ? 'bg-muted text-muted-foreground' : ''}
              `}>
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-[11px] mt-1.5 whitespace-nowrap font-medium
                ${isCompleted ? 'text-[#1D9E75]' : ''}
                ${isCurrent ? 'text-[#378ADD]' : ''}
                ${isPending ? 'text-muted-foreground' : ''}
              `}>{step}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-[1px] flex-1 mx-2 mt-[-18px]
                ${isCompleted ? 'bg-[#1D9E75]' : 'bg-border'}
              `} />
            )}
          </div>
        );
      })}
    </div>
  );
}