import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// UPDATE
export async function PUT(req, context) {

  try {

    const body = await req.json();

    const updated = await prisma.maintenanceRequest.update({
      where: {
        id: context.params.id,
      },
      data: body,
    });

    return NextResponse.json(updated);

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// DELETE
export async function DELETE(req, context) {

  try {

    await prisma.maintenanceRequest.delete({
      where: {
        id: context.params.id,
      },
    });

    return NextResponse.json({
      success: true,
    });

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}