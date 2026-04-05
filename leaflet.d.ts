declare module "leaflet" {
  export interface DivIcon {}

  interface LeafletModule {
    DivIcon: DivIcon;
    divIcon(options?: unknown): DivIcon;
  }

  const L: LeafletModule;
  export default L;
}
