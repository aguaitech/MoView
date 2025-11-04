import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export function SliderInput({ label, value, min, max, step = 1, helper, onChange }) {
    const [internal, setInternal] = useState(value);
    useEffect(() => {
        setInternal(value);
    }, [value]);
    const handleRangeChange = (event) => {
        const nextValue = Number(event.target.value);
        setInternal(nextValue);
        onChange(Number(nextValue.toFixed(4)));
    };
    const handleNumberChange = (event) => {
        const nextValue = Number(event.target.value);
        setInternal(nextValue);
        onChange(nextValue);
    };
    return (_jsxs("div", { className: "slider-group", children: [_jsx("label", { children: label }), _jsxs("div", { className: "slider-controls", children: [_jsx("input", { type: "range", min: min, max: max, step: step, value: internal, onChange: handleRangeChange }), _jsx("input", { type: "number", min: min, max: max, step: step, value: Number.isNaN(internal) ? '' : internal, onChange: handleNumberChange })] }), helper ? _jsx("span", { className: "helper-text", children: helper }) : null] }));
}
