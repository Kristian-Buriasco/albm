'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  Children,
  isValidElement,
  type SelectHTMLAttributes,
  type ReactNode,
} from 'react';

interface SelectOption {
  value: string;
  label: string;
  disabled: boolean;
}

/**
 * Custom combobox/listbox that stands in for a native <select> everywhere
 * this codebase uses one. The closed control already looked custom (a
 * button styled like the old appearance-none <select>) but the open
 * options list is, on every browser, an unstyleable native popup — this
 * component replaces that popup with our own absolutely-positioned
 * role="listbox" panel so the whole control matches the site's look,
 * including on touch devices.
 *
 * External API intentionally mirrors <select>: value/defaultValue/onChange
 * (onChange receives a shimmed event with target.value/target.name, since
 * every caller only reads e.target.value), className, id, name, required,
 * disabled, onClick, and children as an array of <option value=...>Label</option>.
 *
 * Form participation: when `name` is passed, a hidden <input type="hidden">
 * mirrors the selected value so a parent <form>'s `new FormData(form)` still
 * picks it up (see ContactForm.tsx, which reads form data by field name, not
 * React state).
 */
function parseOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as {
      value?: string;
      disabled?: boolean;
      children?: ReactNode;
    };
    const value = props.value != null ? String(props.value) : '';
    const label =
      typeof props.children === 'string' || typeof props.children === 'number'
        ? String(props.children)
        : Children.toArray(props.children).join('');
    options.push({ value, label, disabled: !!props.disabled });
  });
  return options;
}

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(
    {
      className = '',
      children,
      value,
      defaultValue,
      onChange,
      onClick,
      id,
      name,
      required,
      disabled,
      form,
      style,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      ...rest
    },
    ref,
  ) {
    // A select with `w-full` needs its wrapper to actually take that width too —
    // an inline-block wrapper sizing to a 100%-wide child is a circular layout
    // (both collapse). Every other select is intrinsically sized, where
    // inline-block sizing to content works fine.
    const isBlock = /\bw-full\b/.test(className);

    const options = useMemo(() => parseOptions(children), [children]);

    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState(() =>
      String(defaultValue ?? value ?? ''),
    );
    const selectedValue = isControlled ? String(value ?? '') : internalValue;

    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const wrapperRef = useRef<HTMLSpanElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // No call site in this codebase forwards a ref to Select and reads
    // select-specific members off it (checked: no `.selectedIndex`,
    // `.value`, or similar usage) — the ref is only ever a focus target,
    // so it's fine for the forwarded HTMLSelectElement ref to actually
    // point at the visible button.
    useImperativeHandle(ref, () => buttonRef.current as unknown as HTMLSelectElement, []);

    const selectedOption = options.find((o) => o.value === selectedValue);
    const selectedLabel = selectedOption?.label ?? '';

    // Close on outside click.
    useEffect(() => {
      if (!open) return;
      function handleMouseDown(e: MouseEvent) {
        if (!wrapperRef.current?.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      document.addEventListener('mousedown', handleMouseDown);
      return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [open]);

    // Keep the highlighted option in view when navigating with the keyboard.
    useEffect(() => {
      if (!open) return;
      const el = listRef.current?.querySelector<HTMLElement>(
        `[data-option-index="${highlightedIndex}"]`,
      );
      el?.scrollIntoView({ block: 'nearest' });
    }, [open, highlightedIndex]);

    function commitChange(nextValue: string) {
      if (!isControlled) setInternalValue(nextValue);
      onChange?.({
        target: { value: nextValue, name },
      } as unknown as React.ChangeEvent<HTMLSelectElement>);
    }

    function selectOption(index: number) {
      const option = options[index];
      if (!option || option.disabled) return;
      commitChange(option.value);
      setOpen(false);
      buttonRef.current?.focus();
    }

    function openList(startIndex?: number) {
      if (disabled || options.length === 0) return;
      const currentIndex = options.findIndex((o) => o.value === selectedValue);
      setHighlightedIndex(startIndex ?? (currentIndex >= 0 ? currentIndex : 0));
      setOpen(true);
    }

    function firstEnabledIndex() {
      return options.findIndex((o) => !o.disabled);
    }
    function lastEnabledIndex() {
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) return i;
      }
      return -1;
    }
    function nextEnabledIndex(from: number, dir: 1 | -1) {
      let i = from;
      for (let step = 0; step < options.length; step++) {
        i += dir;
        if (i < 0) i = options.length - 1;
        if (i > options.length - 1) i = 0;
        if (!options[i].disabled) return i;
      }
      return from;
    }

    function handleButtonKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
      if (disabled) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!open) {
            openList();
          } else {
            setHighlightedIndex((i) => nextEnabledIndex(i, 1));
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!open) {
            openList();
          } else {
            setHighlightedIndex((i) => nextEnabledIndex(i, -1));
          }
          break;
        case 'Home':
          if (open) {
            e.preventDefault();
            const idx = firstEnabledIndex();
            if (idx >= 0) setHighlightedIndex(idx);
          }
          break;
        case 'End':
          if (open) {
            e.preventDefault();
            const idx = lastEnabledIndex();
            if (idx >= 0) setHighlightedIndex(idx);
          }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (open) {
            selectOption(highlightedIndex);
          } else {
            openList();
          }
          break;
        case 'Escape':
          if (open) {
            e.preventDefault();
            setOpen(false);
            buttonRef.current?.focus();
          }
          break;
        case 'Tab':
          setOpen(false);
          break;
        default:
          break;
      }
    }

    const listboxId = id ? `${id}-listbox` : undefined;

    return (
      <span ref={wrapperRef} className={`relative ${isBlock ? 'block w-full' : 'inline-block'}`}>
        <button
          {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          ref={buttonRef}
          type="button"
          id={id}
          disabled={disabled}
          onClick={(e) => {
            onClick?.(e as unknown as React.MouseEvent<HTMLSelectElement>);
            if (e.defaultPrevented) return;
            if (open) {
              setOpen(false);
            } else {
              openList();
            }
          }}
          onKeyDown={handleButtonKeyDown}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          role="combobox"
          aria-controls={listboxId}
          className={`appearance-none pr-6 text-left ${className}`}
          style={{ WebkitAppearance: 'none', MozAppearance: 'none', ...style }}
        >
          {selectedLabel || ' '}
        </button>
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2 opacity-60"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {open && (
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={
              listboxId && highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined
            }
            className="absolute top-full left-0 z-20 mt-1 max-h-64 w-full min-w-max overflow-y-auto rounded-xl border border-line bg-paper p-1 shadow-2xl dark:border-line-dark dark:bg-paper-dark"
          >
            {options.map((option, index) => {
              const isSelected = option.value === selectedValue;
              const isHighlighted = index === highlightedIndex;
              return (
                <div
                  key={`${option.value}-${index}`}
                  id={listboxId ? `${listboxId}-opt-${index}` : undefined}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled}
                  data-option-index={index}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectOption(index)}
                  className={`cursor-pointer rounded-lg px-3 py-2 text-sm sm:py-1.5 ${
                    option.disabled
                      ? 'cursor-not-allowed opacity-40'
                      : isHighlighted
                        ? 'bg-ink/10 dark:bg-ink-dark/10'
                        : ''
                  } ${isSelected ? 'font-medium text-accent dark:text-accent-dark' : ''}`}
                >
                  {option.label}
                </div>
              );
            })}
          </div>
        )}

        {name && (
          <input type="hidden" name={name} value={selectedValue} required={required} form={form} />
        )}
      </span>
    );
  },
);

export default Select;
