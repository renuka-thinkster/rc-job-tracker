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
      data: body,
    });

    return NextResponse.json(request);

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}