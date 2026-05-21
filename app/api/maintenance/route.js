import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET ALL
export async function GET() {

  try {

    const requests = await prisma.maintenanceRequest.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(requests);

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// CREATE
export async function POST(req) {

  try {

    const body = await req.json();

    const request = await prisma.maintenanceRequest.create({
      data: {
        ticketNumber: body.ticketNumber || "",
        equipment: body.equipment || "",
        description: body.description || "",
        category: body.category || "",
        requestedBy: body.requestedBy || "",
        assignedTo: body.assignedTo || "",
        status: body.status || "Open",

        requestedDate: body.requestedDate
          ? new Date(body.requestedDate)
          : null,

        resolvedDate: body.resolvedDate
          ? new Date(body.resolvedDate)
          : null,

        expectedDays: Number(body.expectedDays) || 0,

        amountSpent: Number(body.amountSpent) || 0,

        vendorName: body.vendorName || "",

        invoiceNumber: body.invoiceNumber || "",

        resolutionNote: body.resolutionNote || "",

        updates: body.updates || [],

        photosBefore: Array.isArray(body.photosBefore)
          ? body.photosBefore
          : [],

        photosAfter: Array.isArray(body.photosAfter)
          ? body.photosAfter
          : [],

        invoicePhotos: Array.isArray(body.invoicePhotos)
          ? body.invoicePhotos
          : [],

        estimate: body.estimate || null,
      },
    });

    return NextResponse.json(request);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}