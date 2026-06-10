import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { PrismaClient } from "@prisma/client";
import { processHomeworkSlice } from "@/lib/gradingEngine";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { assignmentId } = await req.json();
    
    if (!assignmentId) return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 });

    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

    // Mocking email scan if IMAP_USER is not provided.
    // In a real environment, the user would configure these in .env
    const user = process.env.IMAP_USER;
    const pass = process.env.IMAP_PASS;
    const host = process.env.IMAP_HOST || "imap.gmail.com";
    const port = parseInt(process.env.IMAP_PORT || "993");

    if (!user || !pass) {
      console.warn("IMAP credentials not found in .env. Mocking email scan...");
      // Mocking: just return success.
      return NextResponse.json({ success: true, message: "Mock scan complete. Configure .env for real IMAP." });
    }

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass },
      logger: false
    });

    await client.connect();
    
    // Select inbox and fetch unseen messages
    let lock = await client.getMailboxLock('INBOX');
    let fetchedFiles = 0;
    try {
      // Find unseen messages
      for await (let message of client.fetch({ seen: false }, { source: true })) {
        if (message.source) {
          const parsed = (await simpleParser(message.source)) as any;
          
          if (parsed && parsed.attachments) {
            for (const attachment of parsed.attachments) {
              if (attachment.contentType === 'application/pdf' || attachment.contentType.startsWith('image/')) {
                const ext = attachment.contentType === 'application/pdf' ? '.pdf' : '.jpg';
                const filename = `email_${Date.now()}_${Math.floor(Math.random()*1000)}${ext}`;
            
            const uploadsDir = path.join(process.cwd(), "public", "uploads");
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            
            const filePath = path.join(uploadsDir, filename);
            fs.writeFileSync(filePath, attachment.content);
            const publicPath = `/uploads/${filename}`;
            
            // Create a generic student or look up by email
            let student = await prisma.student.findFirst({ where: { classId: assignment.classId } });
            if (!student) {
              student = await prisma.student.create({
                data: { studentId: `email_${Date.now()}`, name: "Unknown Sender", classId: assignment.classId }
              });
            }

            const submission = await prisma.submission.create({
              data: {
                student: { connect: { id: student.id } },
                assignment: { connect: { id: assignment.id } },
                status: "Queued",
                rawImagePath: publicPath
              }
            });

            fetchedFiles++;
          }
        }
      }
    }
  }
      
      // Mark as seen (Optional: disabled for testing)
      // await client.messageFlagsAdd({ seen: false }, ['\\Seen']);
      
    } finally {
      lock.release();
      await client.logout();
    }

    return NextResponse.json({ success: true, filesFound: fetchedFiles });
  } catch (error) {
    console.error("IMAP Error:", error);
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}
