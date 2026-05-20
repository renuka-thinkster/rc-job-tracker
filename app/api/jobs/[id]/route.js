import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// UPDATE JOB
export async function PUT(req, { params }) {

  try {

    const body = await req.json();

    const updatedJob = await prisma.job.update({
      where: {
        id: params.id,
      },
      data: {
        ticketNumber: body.ticketNumber,
        title: body.title,
        description: body.description || "",
        type: body.type || "",
        category: body.category || "",
        assignedTo: body.assignedTo || "",
        status: body.status || "WIP",
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

    return NextResponse.json(updatedJob);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        error: "Failed updating job",
      },
      {
        status: 500,
      }
    );
  }
}

// DELETE JOB
export async function DELETE(req, { params }) {

  try {

    await prisma.job.delete({
      where: {
        id: params.id,
      },
    });

    return NextResponse.json({
      success: true,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        error: "Failed deleting job",
      },
      {
        status: 500,
      }
    );
  }
}