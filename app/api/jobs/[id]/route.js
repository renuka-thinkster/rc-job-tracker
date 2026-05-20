import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(req, { params }) {
  try {
    const body = await req.json();

    const updatedJob = await prisma.job.update({
      where: {
        id: params.id,
      },
      data: body,
    });

    return NextResponse.json(updatedJob);

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to update job" },
      { status: 500 }
    );
  }
}

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
      { error: "Failed to delete job" },
      { status: 500 }
    );
  }
}