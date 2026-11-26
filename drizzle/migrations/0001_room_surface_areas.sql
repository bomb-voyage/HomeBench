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
-- The column keeps its name and type so the live app keeps reading it; it is
-- maintained by a trigger instead of a fixed generated formula.
ALTER TABLE public.rooms ALTER COLUMN area_sqft DROP EXPRESSION;

COMMENT ON COLUMN public.rooms.area_sqft IS 'Room size in sq ft: COALESCE(floor_area_sqft, length_ft * width_ft) plus closet_area_sqft when has_closet. Maintained by trigger rooms_set_area_sqft.';

CREATE OR REPLACE FUNCTION public.set_room_area_sqft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.area_sqft := COALESCE(NEW.floor_area_sqft, NEW.length_ft * NEW.width_ft)
    + CASE WHEN NEW.has_closet THEN COALESCE(NEW.closet_area_sqft, 0) ELSE 0 END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rooms_set_area_sqft
  BEFORE INSERT OR UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_room_area_sqft();

-- Backfill rooms that already exist so their size matches the new rule.
UPDATE public.rooms
SET area_sqft = COALESCE(floor_area_sqft, length_ft * width_ft)
  + CASE WHEN has_closet THEN COALESCE(closet_area_sqft, 0) ELSE 0 END
WHERE area_sqft IS DISTINCT FROM (
  COALESCE(floor_area_sqft, length_ft * width_ft)
    + CASE WHEN has_closet THEN COALESCE(closet_area_sqft, 0) ELSE 0 END
);