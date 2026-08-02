import { CreateFromScratchEditor } from "@/components/hackathon/create-from-scratch-editor"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create Hackathon | hackathon.new",
  description: "Create a new hackathon from scratch.",
}

export default function CreatePage() {
  return <CreateFromScratchEditor />
}
