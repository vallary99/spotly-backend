import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../business/entities/category.entity';
import { Neighborhood } from '../business/entities/neighborhood.entity';
import { QuickFilterGroup } from '../business/entities/quick-filter-group.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/config.dto';
import { CreateNeighborhoodDto, UpdateNeighborhoodDto } from './dto/config.dto';
import { CreateQuickFilterGroupDto, UpdateQuickFilterGroupDto, MapCategoriesToGroupDto } from './dto/config.dto';

@Injectable()
export class AdminConfigService {
  constructor(
    @InjectRepository(Category) private categories: Repository<Category>,
    @InjectRepository(Neighborhood) private neighborhoods: Repository<Neighborhood>,
    @InjectRepository(QuickFilterGroup) private filterGroups: Repository<QuickFilterGroup>,
  ) {}

  // ====== Category Management ======

  async findAllCategories() {
    return this.categories.find({
      order: { createdAt: 'DESC' },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    // Check for duplicate name
    const existing = await this.categories.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new BadRequestException(`Category "${dto.name}" already exists.`);
    }

    return this.categories.save(this.categories.create(dto));
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found.`);
    }

    // Check if updating name and it creates a duplicate
    if (dto.name && dto.name !== category.name) {
      const existing = await this.categories.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new BadRequestException(`Category "${dto.name}" already exists.`);
      }
    }

    Object.assign(category, dto);
    return this.categories.save(category);
  }

  async deleteCategory(id: string) {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found.`);
    }

    await this.categories.remove(category);
    return { success: true };
  }

  // ====== Neighborhood Management ======

  async findAllNeighborhoods() {
    return this.neighborhoods.find({
      // City then name, not creation order — the admin UI groups by
      // city, so this ordering is what makes each group's contents
      // already sorted with no client-side re-sort needed.
      order: { city: 'ASC', name: 'ASC' },
    });
  }

  async createNeighborhood(dto: CreateNeighborhoodDto) {
    // Check for duplicate name
    const existing = await this.neighborhoods.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new BadRequestException(`Neighborhood "${dto.name}" already exists.`);
    }

    return this.neighborhoods.save(this.neighborhoods.create(dto));
  }

  async updateNeighborhood(id: string, dto: UpdateNeighborhoodDto) {
    const neighborhood = await this.neighborhoods.findOne({ where: { id } });
    if (!neighborhood) {
      throw new NotFoundException(`Neighborhood with ID ${id} not found.`);
    }

    // Check if updating name and it creates a duplicate
    if (dto.name && dto.name !== neighborhood.name) {
      const existing = await this.neighborhoods.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new BadRequestException(`Neighborhood "${dto.name}" already exists.`);
      }
    }

    Object.assign(neighborhood, dto);
    return this.neighborhoods.save(neighborhood);
  }

  async deleteNeighborhood(id: string) {
    const neighborhood = await this.neighborhoods.findOne({ where: { id } });
    if (!neighborhood) {
      throw new NotFoundException(`Neighborhood with ID ${id} not found.`);
    }

    await this.neighborhoods.remove(neighborhood);
    return { success: true };
  }

  // ====== QuickFilterGroup Management ======

  async findAllFilterGroups() {
    return this.filterGroups.find({
      relations: ['categories'],
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findFilterGroupById(id: string) {
    const group = await this.filterGroups.findOne({
      where: { id },
      relations: ['categories'],
    });
    if (!group) {
      throw new NotFoundException(`Filter group with ID ${id} not found.`);
    }
    return group;
  }

  async createFilterGroup(dto: CreateQuickFilterGroupDto) {
    // Check for duplicate label
    const existing = await this.filterGroups.findOne({ where: { label: dto.label } });
    if (existing) {
      throw new BadRequestException(`Filter group "${dto.label}" already exists.`);
    }

    const group = this.filterGroups.create(dto);

    // Link categories if provided
    if (dto.categoryIds && dto.categoryIds.length > 0) {
      const categories = await this.categories.findByIds(dto.categoryIds);
      if (categories.length !== dto.categoryIds.length) {
        throw new BadRequestException('One or more category IDs not found.');
      }
      group.categories = categories;
    }

    return this.filterGroups.save(group);
  }

  async updateFilterGroup(id: string, dto: UpdateQuickFilterGroupDto) {
    const group = await this.filterGroups.findOne({
      where: { id },
      relations: ['categories'],
    });
    if (!group) {
      throw new NotFoundException(`Filter group with ID ${id} not found.`);
    }

    // Check if updating label and it creates a duplicate
    if (dto.label && dto.label !== group.label) {
      const existing = await this.filterGroups.findOne({ where: { label: dto.label } });
      if (existing) {
        throw new BadRequestException(`Filter group "${dto.label}" already exists.`);
      }
    }

    // Update basic fields
    if (dto.label) group.label = dto.label;
    if (dto.icon !== undefined) group.icon = dto.icon;
    if (dto.sortOrder !== undefined) group.sortOrder = dto.sortOrder;

    // Update category relationships if provided
    if (dto.categoryIds) {
      if (dto.categoryIds.length === 0) {
        group.categories = [];
      } else {
        const categories = await this.categories.findByIds(dto.categoryIds);
        if (categories.length !== dto.categoryIds.length) {
          throw new BadRequestException('One or more category IDs not found.');
        }
        group.categories = categories;
      }
    }

    return this.filterGroups.save(group);
  }

  async deleteFilterGroup(id: string) {
    const group = await this.filterGroups.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Filter group with ID ${id} not found.`);
    }

    await this.filterGroups.remove(group);
    return { success: true };
  }

  // Map/update categories for a specific filter group
  async mapCategoriesToGroup(groupId: string, dto: MapCategoriesToGroupDto) {
    const group = await this.filterGroups.findOne({
      where: { id: groupId },
      relations: ['categories'],
    });
    if (!group) {
      throw new NotFoundException(`Filter group with ID ${groupId} not found.`);
    }

    if (dto.categoryIds.length === 0) {
      group.categories = [];
    } else {
      const categories = await this.categories.findByIds(dto.categoryIds);
      if (categories.length !== dto.categoryIds.length) {
        throw new BadRequestException('One or more category IDs not found.');
      }
      group.categories = categories;
    }

    return this.filterGroups.save(group);
  }
}
