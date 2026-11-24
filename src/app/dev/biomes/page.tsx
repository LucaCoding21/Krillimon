import { notFound } from "next/navigation";
import { BiomePreview } from "./preview";

// Development-only gallery of every biome. Not available in production builds.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BiomePreview />;
}
