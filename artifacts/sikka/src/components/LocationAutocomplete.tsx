import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Search, MapPin, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibmV6YXJpc21haWwiLCJhIjoiY21ucTdoZ3gxMDRiNzJxcjRhemY0ejhhbyJ9.fkkcuisxpZP9y0Uaq9HryQ';

interface Suggestion {
  id: string;
  place_name: string;
  center: [number, number];
  text: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: Suggestion) => void;
  placeholder?: string;
  className?: string;
  trailingAction?: 'clear' | 'cancelTrip';
  onTrailingAction?: () => void;
  trailingLabel?: string;
  readOnlyDisplay?: string;
}

const LocationAutocomplete = ({ value, onChange, onSelect, placeholder, className, trailingAction, onTrailingAction, trailingLabel, readOnlyDisplay }: LocationAutocompleteProps) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (readOnlyDisplay || value.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${MAPBOX_TOKEN}&country=eg&language=en,ar&limit=7&types=country,region,place,district,locality,neighborhood,address,poi`
        );
        interface MapboxFeature {
          id: string;
          place_name: string;
          center: [number, number];
          text: string;
        }
        interface MapboxResponse { features?: MapboxFeature[] }
        const data = await res.json() as MapboxResponse;
        if (data.features) {
          setSuggestions(data.features.map((f) => ({
            id: f.id,
            place_name: f.place_name,
            center: f.center,
            text: f.text,
          })));
          setIsOpen(true);
        }
      } catch (err) {
        console.error('Geocoding error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  }, [value, readOnlyDisplay]);

  const displayValue = readOnlyDisplay
    ? (readOnlyDisplay.length > 34 ? readOnlyDisplay.slice(0, 34).trimEnd() + '…' : readOnlyDisplay)
    : value;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        {isLoading && !trailingAction && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />}
        {trailingAction === 'cancelTrip' && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTrailingAction?.(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 px-5 rounded-full bg-destructive hover:bg-destructive/90 text-white text-sm font-semibold shadow-lg transition-colors flex items-center justify-center"
            aria-label="Cancel current trip"
          >
            {trailingLabel || 'Cancel'}
          </button>
        )}
        {trailingAction === 'clear' && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTrailingAction?.(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-muted/70 hover:bg-muted text-muted-foreground border border-border shadow-sm transition-colors flex items-center justify-center"
            aria-label="Clear search"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        )}
        <Input
          placeholder={placeholder}
          value={displayValue}
          readOnly={!!readOnlyDisplay}
          title={readOnlyDisplay ?? undefined}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => !readOnlyDisplay && suggestions.length > 0 && setIsOpen(true)}
          className={cn("pl-11 shadow-xl border border-white/20 h-14 text-base rounded-[2rem] glass-panel truncate", trailingAction === 'cancelTrip' ? "pr-28" : trailingAction === 'clear' ? "pr-14" : "")}
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-panel rounded-[1.75rem] z-50 overflow-hidden max-h-[300px] overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onSelect(s);
                onChange(s.place_name);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors border-b last:border-b-0"
            >
              <MapPin className="h-4 w-4 text-destructive shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{s.text}</p>
                <p className="text-xs text-muted-foreground truncate">{s.place_name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationAutocomplete;
