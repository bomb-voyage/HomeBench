-- Surface areas from the iOS camera scan (or typed in), plus closet details.
-- floor_area_sqft is the true floor area (handles L-shaped rooms) and includes
-- the floor under cabinets; cabinet_area_sqft is that cabinet footprint.
ALTER TABLE public.rooms
  ADD COLUMN floor_area_sqft NUMERIC,
  ADD COLUMN wall_area_sqft NUMERIC,
  ADD COLUMN cabinet_area_sqft NUMERIC,
  ADD COLUMN has_closet BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN closet_area_sqft NUMERIC;

COMMENT ON COLUMN public.rooms.floor_area_sqft IS 'Floor area in sq ft, including under cabinets and excluding any closet. Null means use length x width.';
COMMENT ON COLUMN public.rooms.wall_area_sqft IS 'Wall area in sq ft with doors, windows and openings subtracted.';
COMMENT ON COLUMN public.rooms.cabinet_area_sqft IS 'Approximate floor footprint of cabinets and built-ins, in sq ft.';
COMMENT ON COLUMN public.rooms.closet_area_sqft IS 'Closet floor area in sq ft, used when has_closet is true.';

-- Room size shown in the app: scanned floor area when known, otherwise
-- length x width, plus the closet by default.
ALTER TABLE public.rooms DROP COLUMN area_sqft;
ALTER TABLE public.rooms ADD COLUMN area_sqft NUMERIC GENERATED ALWAYS AS (
  COALESCE(floor_area_sqft, length_ft * width_ft)
    + CASE WHEN has_closet THEN COALESCE(closet_area_sqft, 0) ELSE 0 END
) STORED;
