import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// DELETE JOB
export async function DELETE(request, context) {

  try {

    const id = context.params.id;

    console.log("Deleting:", id);

    await prisma.job.delete({
      where: {
        id: id,
      },
    });

    return NextResponse.json({
      success: true,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

// UPDATE JOB
export async function PUT(request, context) {

  try {

    const id = context.params.id;

    const body = await request.json();

    const updated = await prisma.job.update({
      where: {
        id: id,
      },
      data: body,
    });

    return NextResponse.json(updated);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}