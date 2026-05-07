import { useEffect, useState } from "react";

type Props = {
  value: string;
  label?: string;
  className?: string;
};

export const CopyButton = ({ value, label = "Copy", className }: Props) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-label={`Copy ${label}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
};
