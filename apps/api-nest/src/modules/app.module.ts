import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LessonsController } from '../routes/lessons.controller';
import { VocabController } from '../routes/vocab.controller';
import { ReviewsController } from '../routes/reviews.controller';
import { ProgressController } from '../routes/progress.controller';
import { PodcastController } from '../routes/podcast.controller';
import { PracticeController } from '../routes/practice.controller';
import { AuthController } from '../routes/auth.controller';
import { SubscriptionController } from '../routes/subscription.controller';
import { AdminController } from '../routes/admin.controller';
import { UploadController } from '../routes/upload.controller';
import { TTSController } from '../routes/tts.controller';
import { ModelConfigController } from '../routes/model-config.controller';
import { MediaController } from '../routes/media.controller';
import { PrismaService } from '../services/prisma.service';
import { AuthService } from '../services/auth.service';
import { LessonService } from '../services/lesson.service';
import { ProgressService } from '../services/progress.service';
import { PracticeService } from '../services/practice.service';
import { AppSettingService } from '../services/app-setting.service';
import { LessonAudioService } from '../services/lesson-audio.service';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { AdminGuard } from '../guards/admin.guard';
import { CsrfMiddleware } from '../middleware/csrf.middleware';

@Module({
  imports: [],
  controllers: [LessonsController, VocabController, ReviewsController, ProgressController, PodcastController, PracticeController, AuthController, SubscriptionController, AdminController, UploadController, TTSController, ModelConfigController, MediaController],
  providers: [PrismaService, AuthService, LessonService, ProgressService, PracticeService, AppSettingService, LessonAudioService, AdminGuard, CsrfMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware, AuthMiddleware).forRoutes('*');
  }
}
