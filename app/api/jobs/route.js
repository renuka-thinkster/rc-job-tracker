import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET ALL JOBS
export async function GET() {
  try {

    const jobs = await prisma.job.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(jobs);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      { error: "Failed fetching jobs" },
      { status: 500 }
    );
  }
}

// CREATE JOB
export async function POST(req) {

  try {

    const body = await req.json();

    const job = await prisma.job.create({
      data: {
        id: body.id,
        ticketNumber: body.ticketNumber,
        title: body.title,
        description: body.description || "",
        type: body.type || "",
        category: body.category || "",
        assignedTo: body.assignedTo || "",
        status: body.status || "Open",
        remark: body.remark || "",

        creationDate: body.creationDate
          ? new Date(body.creationDate)
          : null,

        startDate: body.startDate
          ? new Date(body.startDate)
          : null,

        endDate: body.endDate
          ? new Date(body.endDate)
          : null,

        completedDate: body.completedDate || null,

        additionalAssignees:
          body.additionalAssignees || [],

        statusHistory:
          body.statusHistory || [],

        updates:
          body.updates || [],

        beforePhotos:
          body.beforePhotos || [],

        afterPhotos:
          body.afterPhotos || [],

        estimation:
          body.estimation || null,
      },
    });

    return NextResponse.json(job);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        error: "Failed saving job",
        details: error.message,
      },
      { status: 500 }
    );
  }
}