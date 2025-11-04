import { useEffect, useState, ChangeEvent } from 'react';

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  helper?: string;
  onChange: (value: number) => void;
}

export function SliderInput({ label, value, min, max, step = 1, helper, onChange }: SliderInputProps) {
  const [internal, setInternal] = useState(value);

  useEffect(() => {
    setInternal(value);
  }, [value]);

  const handleRangeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    setInternal(nextValue);
    onChange(Number(nextValue.toFixed(4)));
  };

  const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    setInternal(nextValue);
    onChange(nextValue);
  };

  return (
    <div className="slider-group">
      <label>{label}</label>
      <div className="slider-controls">
        <input type="range" min={min} max={max} step={step} value={internal} onChange={handleRangeChange} />
        <input type="number" min={min} max={max} step={step} value={Number.isNaN(internal) ? '' : internal} onChange={handleNumberChange} />
      </div>
      {helper ? <span className="helper-text">{helper}</span> : null}
    </div>
  );
}
