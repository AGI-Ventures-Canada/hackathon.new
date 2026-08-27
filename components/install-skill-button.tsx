"use client";

import { type ReactNode, useState } from "react";
import { Check, Copy, Download, Terminal } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const INSTALL_COMMAND = "npx skills add AGI-Ventures-Canada/hackathon.new";

interface InstallSkillButtonProps {
  trigger?: ReactNode;
}

export function InstallSkillButton({ trigger }: InstallSkillButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline">
            <Download className="size-4 mr-2" />
            Install Skill
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Hackathons from Your AI Agent</DialogTitle>
          <DialogDescription>
            Add this skill to create and manage hackathons from Claude Code or
            your agent of choice.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 overflow-hidden rounded-lg border bg-muted p-3 font-mono text-sm">
            <Terminal className="size-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
              {INSTALL_COMMAND}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={handleCopy}
              aria-label={
                copied ? "Copied install command" : "Copy install command"
              }
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
          <Accordion type="single" collapsible>
            <AccordionItem value="troubleshooting">
              <AccordionTrigger>Troubleshooting</AccordionTrigger>
              <AccordionContent>
                <p>
                  Run the command from the project directory where you want the
                  skill available.
                </p>
                <p>
                  If <code>npx skills</code> is unavailable, use Node.js 18 or
                  newer.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </DialogContent>
    </Dialog>
  );
}
