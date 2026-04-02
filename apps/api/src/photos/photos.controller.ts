import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  CleanupAbandonedUploadsInput,
  CleanupAbandonedUploadsResponse,
  CompletePhotoUploadInput,
  CompletePhotoUploadResponse,
  CreatePhotoUploadInput,
  CreatePhotoUploadResponse,
  GetPhotoResponse,
} from "@glitter-atlas/shared";
import { RequireAuthAccess } from "../auth/auth-access.decorator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import { PhotosService } from "./photos.service";

type PhotoListResponse = {
  items: GetPhotoResponse[];
  nextCursor: string | null;
};

type SetPhotoVisibilityInput = {
  visibility?: string;
};

@Controller("photos")
export class PhotosController {
  constructor(
    @Inject(PhotosService)
    private readonly photosService: PhotosService,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Post("uploads")
  @UseGuards(AuthGuard)
  @RequireAuthAccess("approved")
  async createUpload(
    @Body() body: CreatePhotoUploadInput,
    @Headers("cookie") cookieHeader?: string,
  ): Promise<CreatePhotoUploadResponse> {
    const session = await this.authService.getApprovedSessionContext(
      this.readSessionToken(cookieHeader),
    );

    return this.photosService.createUpload(body, {
      approvedUserId: session.approvedUserId,
    });
  }

  @Post("cleanup/abandoned")
  @UseGuards(AuthGuard)
  @RequireAuthAccess("super_admin")
  cleanupAbandoned(
    @Body() body?: CleanupAbandonedUploadsInput,
  ): Promise<CleanupAbandonedUploadsResponse> {
    return this.photosService.cleanupAbandonedUploads(body);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @RequireAuthAccess("approved")
  async completeUpload(
    @Param("id") id: string,
    @Body() body: CompletePhotoUploadInput,
    @Headers("cookie") cookieHeader?: string,
  ): Promise<CompletePhotoUploadResponse> {
    const photoId = this.normalizePhotoId(id);
    const objectKey = body?.objectKey?.trim();

    if (typeof objectKey !== "string" || objectKey.length === 0) {
      throw new BadRequestException("objectKey is required");
    }

    const session = await this.authService.getApprovedSessionContext(
      this.readSessionToken(cookieHeader),
    );

    return this.photosService.completeUpload(photoId, {
      objectKey,
      approvedUserId: session.approvedUserId,
    });
  }

  @Get("shared")
  @UseGuards(AuthGuard)
  @RequireAuthAccess("approved")
  listSharedPhotos(): Promise<PhotoListResponse> {
    return this.photosService.listSharedPhotos();
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  @RequireAuthAccess("approved")
  async getPhoto(
    @Param("id") id: string,
    @Headers("cookie") cookieHeader?: string,
  ): Promise<GetPhotoResponse> {
    const session = await this.authService.getApprovedSessionContext(
      this.readSessionToken(cookieHeader),
    );

    return this.photosService.getPhoto(this.normalizePhotoId(id), {
      approvedUserId: session.approvedUserId,
    });
  }

  @Get()
  @UseGuards(AuthGuard)
  @RequireAuthAccess("approved")
  async listPhotos(
    @Headers("cookie") cookieHeader?: string,
  ): Promise<PhotoListResponse> {
    const session = await this.authService.getApprovedSessionContext(
      this.readSessionToken(cookieHeader),
    );

    return this.photosService.listPhotos({
      approvedUserId: session.approvedUserId,
    });
  }

  @Post(":id/visibility")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @RequireAuthAccess("approved")
  async setPhotoVisibility(
    @Param("id") id: string,
    @Body() body: SetPhotoVisibilityInput,
    @Headers("cookie") cookieHeader?: string,
  ): Promise<{ ok: true; photoId: string; visibility: "private" | "shared" }> {
    const session = await this.authService.getApprovedSessionContext(
      this.readSessionToken(cookieHeader),
    );

    return this.photosService.setPhotoVisibility(this.normalizePhotoId(id), body?.visibility, {
      approvedUserId: session.approvedUserId,
    });
  }

  @Post(":id/delete")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @RequireAuthAccess("approved")
  async deletePhoto(
    @Param("id") id: string,
    @Headers("cookie") cookieHeader?: string,
  ): Promise<{ ok: true; photoId: string; deleteMode: "soft_delete" }> {
    const session = await this.authService.getApprovedSessionContext(
      this.readSessionToken(cookieHeader),
    );

    return this.photosService.deletePhoto(this.normalizePhotoId(id), {
      approvedUserId: session.approvedUserId,
    });
  }

  private readSessionToken(cookieHeader?: string) {
    const cookie = cookieHeader
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("glitter_atlas_session="));

    return cookie ? cookie.slice("glitter_atlas_session=".length) : null;
  }

  private normalizePhotoId(id: string) {
    const value = id?.trim();
    const digitPattern = new RegExp("^\\d+$");

    if (typeof value !== "string" || value.length === 0 || digitPattern.test(value) === false) {
      throw new BadRequestException("invalid photo id");
    }

    return value;
  }
}
