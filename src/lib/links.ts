import type { Park } from "./types";
export const parkHref = (p: Park) => (p.id.startsWith("demo-") ? `/park/${p.id}/` : `/park/live/?ref=${encodeURIComponent(p.id)}`);
